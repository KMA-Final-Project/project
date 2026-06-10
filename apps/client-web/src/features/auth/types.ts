export type {
  AuthResponse as AuthSession,
  LoginPayload,
  Tokens as AuthTokens,
  UserProfile as AuthUser,
  UserRole,
  RegisterPayload,
  VerifyOtpPayload as VerifyPayload,
} from "@kapter/contracts"

export type ForgotPasswordPayload = {
  email: string
}

export type ResetPasswordPayload = {
  email: string
  otp: string
  newPassword: string
}
