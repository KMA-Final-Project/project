import { create } from "zustand";
import type {
  UserProfile,
  LoginPayload,
  RegisterPayload,
  VerifyOtpPayload,
} from "@/types/auth";
import { authApi } from "@/services";
import { getTokens, setTokens, clearTokens } from "@/services/token-storage";

interface AuthState {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isHydrated: boolean;
  pendingEmail: string | null;
}

interface AuthActions {
  register: (payload: RegisterPayload) => Promise<string>;
  login: (payload: LoginPayload) => Promise<void>;
  verifyOtp: (payload: VerifyOtpPayload) => Promise<void>;
  logout: () => Promise<void>;
  invalidate: () => void;
  hydrate: () => Promise<void>;
  setPendingEmail: (email: string | null) => void;
}

export const useAuthStore = create<AuthState & AuthActions>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  isHydrated: false,
  pendingEmail: null,

  register: async (payload) => {
    set({ isLoading: true });
    try {
      const res = await authApi.register(payload);
      set({ pendingEmail: payload.email });
      return res.message;
    } finally {
      set({ isLoading: false });
    }
  },

  login: async (payload) => {
    set({ isLoading: true });
    try {
      const res = await authApi.login(payload);
      await setTokens(res.tokens);
      set({ user: res.user, isAuthenticated: true });
    } finally {
      set({ isLoading: false });
    }
  },

  verifyOtp: async (payload) => {
    set({ isLoading: true });
    try {
      const res = await authApi.verifyOtp(payload);
      await setTokens(res.tokens);
      set({
        user: res.user,
        isAuthenticated: true,
        pendingEmail: null,
      });
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await authApi.logout();
    } catch {
      // Logout even if server call fails
    } finally {
      await clearTokens();
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        pendingEmail: null,
      });
    }
  },

  invalidate: () => {
    set({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      pendingEmail: null,
    });
  },

  hydrate: async () => {
    try {
      const tokens = await getTokens();
      if (tokens?.refreshToken) {
        const newTokens = await authApi.refreshTokens({
          refreshToken: tokens.refreshToken,
        });
        await setTokens(newTokens);
        set({ isAuthenticated: true });
      }
    } catch {
      await clearTokens();
    } finally {
      set({ isHydrated: true });
    }
  },

  setPendingEmail: (email) => set({ pendingEmail: email }),
}));
