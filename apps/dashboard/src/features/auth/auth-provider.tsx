/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import { loginRequest } from "@/features/auth/auth-api.ts"
import { authStorage } from "@/features/auth/auth-storage.ts"
import type { AuthSession, LoginPayload } from "@/features/auth/types.ts"

type AuthContextValue = {
  session: AuthSession | null
  isAuthenticated: boolean
  isAdmin: boolean
  login: (payload: LoginPayload) => Promise<AuthSession>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

type AuthProviderProps = {
  children: ReactNode
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [session, setSession] = useState<AuthSession | null>(() =>
    authStorage.get()
  )

  useEffect(() => {
    return authStorage.subscribe((detail) => {
      if (detail.type === "clear") {
        setSession(null)
      } else {
        setSession(authStorage.get())
      }
    })
  }, [])

  const login = useCallback(async (payload: LoginPayload) => {
    const nextSession = await loginRequest(payload)
    authStorage.set(nextSession)
    setSession(nextSession)

    return nextSession
  }, [])

  const logout = useCallback(() => {
    authStorage.clear()
    setSession(null)
  }, [])

  const value = useMemo(
    () => ({
      session,
      isAuthenticated: session !== null,
      isAdmin: session?.user.role === "ADMIN",
      login,
      logout,
    }),
    [login, logout, session]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider")
  }

  return context
}
