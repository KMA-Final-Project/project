export type UserRole = "ADMIN" | "USER";

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  emailVerified: boolean;
  role: UserRole;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: UserProfile;
  tokens: Tokens;
}

export interface MessageResponse {
  message: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  fullName: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface VerifyOtpPayload {
  email: string;
  otp: string;
}

export interface RefreshTokenPayload {
  refreshToken: string;
}
