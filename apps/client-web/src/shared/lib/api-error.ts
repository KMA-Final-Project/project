import i18next from "i18next"
import { toast } from "sonner"

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(code: string, status: number) {
    super(code)
    this.name = "ApiError"
    this.code = code
    this.status = status
  }
}

export function extractErrorCode(data: unknown): string {
  if (data && typeof data === "object" && "message" in data) {
    const msg = (data as { message: unknown }).message
    if (typeof msg === "string") return msg
    if (Array.isArray(msg)) return msg.join(", ")
  }
  return "unknownError"
}

export function translateError(code: string): string {
  // Try namespace-specific keys first, then common errors
  const namespaces = ["auth", "billing", "account", "common"]
  for (const ns of namespaces) {
    const key = `errors.${code}`
    if (i18next.exists(key, { ns })) {
      return i18next.t(key, { ns })
    }
  }
  // Fallback to the raw code
  return code
}

export function handleApiError(error: unknown): never {
  if (error instanceof ApiError) {
    const message = translateError(error.code)
    toast.error(message)
    throw error
  }

  if (error instanceof Error) {
    toast.error(error.message)
    throw error
  }

  toast.error("An unexpected error occurred.")
  throw new ApiError("unknownError", 500)
}
