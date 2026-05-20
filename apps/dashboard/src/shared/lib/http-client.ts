import { authStorage } from "@/features/auth/auth-storage.ts"

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

  private async request<TResponse>(path: string, init?: RequestInit) {
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

    if (!response.ok) {
      throw await this.toError(response)
    }

    return (await response.json()) as TResponse
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
