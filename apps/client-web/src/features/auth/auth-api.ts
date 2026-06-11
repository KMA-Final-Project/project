import { publicApi } from "@/shared/lib/api-client.ts"

import type {
  AuthSession,
  LoginPayload,
  RegisterPayload,
  ResetPasswordPayload,
  VerifyPayload,
} from "@/features/auth/types.ts"

type MessageResponse = { message: string }

export const loginRequest = async (
  payload: LoginPayload,
): Promise<AuthSession> => {
  const res = await publicApi.post<AuthSession>("/auth/login", payload)
  return res.data
}

export const registerRequest = async (
  payload: RegisterPayload,
): Promise<MessageResponse> => {
  const res = await publicApi.post<MessageResponse>("/auth/register", payload)
  return res.data
}

export const verifyRequest = async (
  payload: VerifyPayload,
): Promise<AuthSession> => {
  const res = await publicApi.post<AuthSession>("/auth/verify", payload)
  return res.data
}

export const forgotPasswordRequest = async (
  email: string,
): Promise<MessageResponse> => {
  const res = await publicApi.post<MessageResponse>("/auth/forgot-password", {
    email,
  })
  return res.data
}

export const resendRegistrationOtpRequest = async (
  email: string,
): Promise<MessageResponse> => {
  const res = await publicApi.post<MessageResponse>(
    "/auth/resend-registration-otp",
    { email },
  )
  return res.data
}

export const resendForgotPasswordOtpRequest = async (
  email: string,
): Promise<MessageResponse> => {
  const res = await publicApi.post<MessageResponse>(
    "/auth/resend-forgot-password-otp",
    { email },
  )
  return res.data
}

export const resetPasswordRequest = async (
  payload: ResetPasswordPayload,
): Promise<MessageResponse> => {
  const res = await publicApi.post<MessageResponse>(
    "/auth/reset-password",
    payload,
  )
  return res.data
}
