const AUTH_INTENT_KEY = "kapter.auth.intent"

export type AuthIntent = {
  type: "checkout"
  variantId: string
}

export const authIntent = {
  get(): AuthIntent | null {
    const raw = sessionStorage.getItem(AUTH_INTENT_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as AuthIntent
    } catch {
      sessionStorage.removeItem(AUTH_INTENT_KEY)
      return null
    }
  },

  set(intent: AuthIntent) {
    sessionStorage.setItem(AUTH_INTENT_KEY, JSON.stringify(intent))
  },

  clear() {
    sessionStorage.removeItem(AUTH_INTENT_KEY)
  },
}

export function getCheckoutIntent(): {
  returnTo: string
  variantId?: string
} | null {
  const intent = authIntent.get()
  if (!intent) return null
  authIntent.clear()
  return { returnTo: `/pricing?variant=${intent.variantId}`, variantId: intent.variantId }
}
