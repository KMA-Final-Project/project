import type { AuthSession } from "@/features/auth/types.ts"

const AUTH_STORAGE_KEY = "kapter.admin.session"

export const authStorage = {
  get(): AuthSession | null {
    const rawValue = localStorage.getItem(AUTH_STORAGE_KEY)

    if (!rawValue) {
      return null
    }

    try {
      return JSON.parse(rawValue) as AuthSession
    } catch {
      localStorage.removeItem(AUTH_STORAGE_KEY)
      return null
    }
  },
  set(session: AuthSession) {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
  },
  clear() {
    localStorage.removeItem(AUTH_STORAGE_KEY)
  },
}
