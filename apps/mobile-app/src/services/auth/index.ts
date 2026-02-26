import { ENDPOINTS } from "@/constants/endpoint";
import { api } from "@/services";
import {
  RegisterPayload,
  LoginPayload,
  VerifyOtpPayload,
  MessageResponse,
  AuthResponse,
  RefreshTokenPayload,
  Tokens,
} from "@/types/auth";

export const authApi = {
  register: (payload: RegisterPayload) =>
    api.post<MessageResponse>(ENDPOINTS.REGISTER, payload).then((r) => r.data),

  login: (payload: LoginPayload) =>
    api.post<AuthResponse>(ENDPOINTS.LOGIN, payload).then((r) => r.data),

  verifyOtp: (payload: VerifyOtpPayload) =>
    api.post<AuthResponse>(ENDPOINTS.VERIFY_OTP, payload).then((r) => r.data),

  refreshTokens: (payload: RefreshTokenPayload) =>
    api.post<Tokens>(ENDPOINTS.REFRESH_TOKENS, payload).then((r) => r.data),

  logout: () => api.post<MessageResponse>(ENDPOINTS.LOGOUT).then((r) => r.data),
};
