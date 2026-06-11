import axios, {
  type AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { toast } from "sonner";

import { authStorage } from "@/features/auth/auth-storage.ts";
import {
  ApiError,
  extractErrorCode,
  translateError,
} from "@/shared/lib/api-error.ts";

const baseURL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api";

// --- Public API (no auth) ---

export const publicApi = axios.create({ baseURL });

// --- Private API (auth + refresh) ---

export const privateApi = axios.create({ baseURL });

const SKIP_REFRESH = ["/auth/login", "/auth/refresh"];

let refreshPromise: Promise<string> | null = null;

async function attemptRefresh(): Promise<string> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const session = authStorage.get();
    if (!session?.tokens.refreshToken) {
      throw new ApiError("sessionExpired", 401);
    }

    const res = await axios.post<{ accessToken: string; refreshToken: string }>(
      `${baseURL}/auth/refresh`,
      { refreshToken: session.tokens.refreshToken },
    );

    authStorage.updateTokens(res.data);
    return res.data.accessToken;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

// --- Request interceptor: attach token ---

privateApi.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const session = authStorage.get();
  if (session?.tokens.accessToken) {
    config.headers.Authorization = `Bearer ${session.tokens.accessToken}`;
  }
  return config;
});

// --- Response interceptor: auto-refresh + error toast ---

privateApi.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const config = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };
    const status = error.response?.status;
    const url = config?.url ?? "";

    // 401 → attempt refresh
    if (
      status === 401 &&
      !config._retry &&
      !SKIP_REFRESH.some((p) => url.startsWith(p))
    ) {
      config._retry = true;
      try {
        const newToken = await attemptRefresh();
        config.headers.Authorization = `Bearer ${newToken}`;
        return privateApi(config);
      } catch {
        authStorage.clear();
        const message = translateError("sessionExpired");
        toast.error(message);
        throw new ApiError("sessionExpired", 401);
      }
    }

    // Extract error code from response
    const code = extractErrorCode(error.response?.data);
    const message = translateError(code);

    // Auto-toast for non-auth errors
    if (status !== 401) {
      toast.error(message);
    }

    throw new ApiError(code, status ?? 500);
  },
);

// --- Public API error interceptor (no refresh, just toast) ---

publicApi.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError) => {
    const code = extractErrorCode(error.response?.data);
    const message = translateError(code);
    toast.error(message);
    throw new ApiError(code, error.response?.status ?? 500);
  },
);
