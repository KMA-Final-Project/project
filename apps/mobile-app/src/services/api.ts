import axios from "axios";
import { Platform } from "react-native";
import { getTokens, setTokens, clearTokens } from "./token-storage";
import { Tokens } from "@/types/auth";
import { ENDPOINTS } from "@/constants/endpoint";

const DEFAULT_API_BASE_URL =
  Platform.OS === "android"
    ? "http://10.0.2.2:3000/api"
    : Platform.OS === "ios"
      ? "http://127.0.0.1:3000/api"
      : "http://localhost:3000/api";

function normalizeApiBaseUrl(url: string): string {
  let next = url.trim();

  if (Platform.OS === "android") {
    // Android emulator cannot reach host machine via localhost/loopback
    next = next
      .replace("://localhost", "://10.0.2.2")
      .replace("://127.0.0.1", "://10.0.2.2")
      .replace("://[::1]", "://10.0.2.2");
  } else if (Platform.OS === "ios") {
    // iOS simulator handles 127.0.0.1 well; normalize IPv6 loopback
    next = next.replace("://[::1]", "://127.0.0.1");
  }

  return next;
}

const envApiBaseUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

const API_BASE_URL = envApiBaseUrl
  ? envApiBaseUrl.startsWith("https")
    ? envApiBaseUrl
    : normalizeApiBaseUrl(envApiBaseUrl)
  : DEFAULT_API_BASE_URL;

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use(async (config) => {
  const tokens = await getTokens();
  if (tokens?.accessToken) {
    config.headers.Authorization = `Bearer ${tokens.accessToken}`;
  }
  return config;
});

let isRefreshing = false;
let failedQueue: {
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}[] = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((p) => {
    if (error) p.reject(error);
    else p.resolve(token!);
  });
  failedQueue = [];
}

type AuthInvalidatedHandler = () => void | Promise<void>;
let onAuthInvalidated: AuthInvalidatedHandler | null = null;

export function setAuthInvalidatedHandler(
  handler: AuthInvalidatedHandler | null,
) {
  onAuthInvalidated = handler;

  return () => {
    if (onAuthInvalidated === handler) {
      onAuthInvalidated = null;
    }
  };
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status !== 401 || originalRequest._retry) {
      if (__DEV__) {
        console.warn("API request failed", {
          status: error.response?.status,
          method: originalRequest?.method,
          url: originalRequest?.url,
        });
      }
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({
          resolve: (token: string) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(api(originalRequest));
          },
          reject,
        });
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const tokens = await getTokens();
      if (!tokens?.refreshToken) throw new Error("No refresh token");

      const { data } = await axios.post<Tokens>(
        `${API_BASE_URL}${ENDPOINTS.REFRESH_TOKENS}`,
        { refreshToken: tokens.refreshToken },
      );

      await setTokens(data);
      processQueue(null, data.accessToken);

      originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      await clearTokens();

      if (onAuthInvalidated) {
        try {
          await Promise.resolve(onAuthInvalidated());
        } catch (invalidationError) {
          if (__DEV__) {
            console.warn("Auth invalidation handler failed", invalidationError);
          }
        }
      }

      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);
