import { toast } from "sonner"
import { authStorage } from "@/features/auth/auth-storage.ts"
import type { AuthTokens } from "@/features/auth/types.ts"

const resolveBaseUrl = () => {
  const envBaseUrl = import.meta.env.VITE_API_BASE_URL

  if (typeof envBaseUrl === "string" && envBaseUrl.trim().length > 0) {
    return envBaseUrl.replace(/\/$/, "")
  }

  return "http://localhost:3000"
}

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

let refreshPromise: Promise<AuthTokens> | null = null

async function attemptRefresh(): Promise<AuthTokens> {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    const session = authStorage.get()
    if (!session?.tokens.refreshToken) {
      throw new ApiError("No refresh token", 401)
    }

    const response = await fetch(`${resolveBaseUrl()}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: session.tokens.refreshToken }),
    })

    if (!response.ok) {
      throw new ApiError("Refresh failed", response.status)
    }

    const body = (await response.json()) as AuthTokens

    return body
  })()

  try {
    const tokens = await refreshPromise
    authStorage.updateTokens(tokens)
    return tokens
  } finally {
    refreshPromise = null
  }
}

const SKIP_REFRESH_PATHS = ["/auth/login", "/auth/refresh"]

class ApiClient {
  private readonly baseUrl = resolveBaseUrl()

  async post<TResponse>(path: string, body: unknown): Promise<TResponse> {
    return this.request<TResponse>(path, {
      method: "POST",
      body: JSON.stringify(body),
    })
  }

  async patch<TResponse>(path: string, body: unknown): Promise<TResponse> {
    return this.request<TResponse>(path, {
      method: "PATCH",
      body: JSON.stringify(body),
    })
  }

  async delete<TResponse>(path: string): Promise<TResponse> {
    return this.request<TResponse>(path, { method: "DELETE" })
  }

  async get<TResponse>(path: string): Promise<TResponse> {
    return this.request<TResponse>(path)
  }

  private async request<TResponse>(
    path: string,
    init?: RequestInit,
    isRetry = false,
  ): Promise<TResponse> {
    const session = authStorage.get()
    const headers = new Headers(init?.headers)

    headers.set("Content-Type", "application/json")

    if (session?.tokens.accessToken) {
      headers.set("Authorization", `Bearer ${session.tokens.accessToken}`)
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    })

    if (response.ok) {
      return (await response.json()) as TResponse
    }

    if (
      response.status === 401 &&
      !isRetry &&
      !SKIP_REFRESH_PATHS.some((p) => path.startsWith(p))
    ) {
      try {
        const newTokens = await attemptRefresh()
        const retryHeaders = new Headers(init?.headers)
        retryHeaders.set("Content-Type", "application/json")
        retryHeaders.set("Authorization", `Bearer ${newTokens.accessToken}`)

        const retryResponse = await fetch(`${this.baseUrl}${path}`, {
          ...init,
          headers: retryHeaders,
        })

        if (retryResponse.ok) {
          return (await retryResponse.json()) as TResponse
        }

        throw await this.toError(retryResponse)
      } catch {
        authStorage.clear()
        toast.error("Session expired. Please log in again.")
        throw new ApiError("Session expired. Please log in again.", 401)
      }
    }

    throw await this.toError(response)
  }

  private async toError(response: Response) {
    try {
      const payload = (await response.json()) as {
        message?: string | string[]
      }
      const message = Array.isArray(payload.message)
        ? payload.message.join(" ")
        : (payload.message ?? `Request failed with status ${response.status}`)

      return new ApiError(message, response.status)
    } catch {
      return new ApiError(
        `Request failed with status ${response.status}`,
        response.status
      )
    }
  }
}

export const apiClient = new ApiClient()
