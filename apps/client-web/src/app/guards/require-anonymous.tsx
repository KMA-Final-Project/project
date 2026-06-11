import { Navigate, Outlet } from "react-router"

import { useAuth } from "@/features/auth/auth-provider.tsx"

export const RequireAnonymous = () => {
  const { isAuthenticated } = useAuth()

  if (isAuthenticated) {
    return <Navigate to="/account" replace />
  }

  return <Outlet />
}
