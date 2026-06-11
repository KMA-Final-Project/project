import { Navigate, Outlet, useLocation } from "react-router"

import { useAuth } from "@/features/auth/auth-provider.tsx"

export const RequireAuth = () => {
  const location = useLocation()
  const { isAuthenticated } = useAuth()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ returnTo: location.pathname }} />
  }

  return <Outlet />
}
