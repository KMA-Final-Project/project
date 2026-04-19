import { Navigate, Outlet } from "react-router"

import { useAuth } from "@/features/auth/auth-provider.tsx"

export const RequireAnonymous = () => {
  const { isAuthenticated, isAdmin } = useAuth()

  if (isAuthenticated && isAdmin) {
    return <Navigate to="/overview" replace />
  }

  return <Outlet />
}
