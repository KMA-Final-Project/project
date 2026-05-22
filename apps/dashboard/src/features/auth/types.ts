export type UserRole = "ADMIN" | "USER"

export type AuthUser = {
  id: string
  email: string
  fullName: string
  emailVerified: boolean
  role: UserRole
}

export type AuthTokens = {
  accessToken: string
  refreshToken: string
}

export type AuthSession = {
  user: AuthUser
  tokens: AuthTokens
}

export type LoginPayload = {
  email: string
  password: string
}
