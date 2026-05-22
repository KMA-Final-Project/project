import { apiClient, ApiError } from "@/shared/lib/http-client.ts"

import type { AuthSession, LoginPayload } from "@/features/auth/types.ts"

type BackendLoginResponse = AuthSession

export const loginRequest = async (
  payload: LoginPayload
): Promise<AuthSession> => {
  const session = await apiClient.post<BackendLoginResponse>(
    "/auth/login",
    payload
  )

  if (session.user.role !== "ADMIN") {
    throw new ApiError("This account does not have administrator access.", 403)
  }

  return session
}
