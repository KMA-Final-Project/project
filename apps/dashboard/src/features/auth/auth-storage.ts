import type { AuthTokens, AuthSession } from "@/features/auth/types.ts"

const AUTH_STORAGE_KEY = "kapter.admin.session"
const AUTH_EVENT_KEY = "kapter-admin-auth-change"

type AuthChangeDetail = { type: "update" | "clear" }

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
    this.emit({ type: "update" })
  },

  clear() {
    localStorage.removeItem(AUTH_STORAGE_KEY)
    this.emit({ type: "clear" })
  },

  updateTokens(tokens: AuthTokens) {
    const current = this.get()
    if (!current) return
    const next: AuthSession = {
      user: current.user,
      tokens,
    }
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next))
    this.emit({ type: "update" })
  },

  subscribe(callback: (detail: AuthChangeDetail) => void): () => void {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<AuthChangeDetail>).detail
      callback(detail)
    }
    window.addEventListener(AUTH_EVENT_KEY, handler)
    return () => window.removeEventListener(AUTH_EVENT_KEY, handler)
  },

  emit(detail: AuthChangeDetail) {
    window.dispatchEvent(new CustomEvent(AUTH_EVENT_KEY, { detail }))
  },
}
