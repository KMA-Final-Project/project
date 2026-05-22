import { Navigate, Outlet, useLocation } from "react-router"

import { useAuth } from "@/features/auth/auth-provider.tsx"

export const RequireAdmin = () => {
  const location = useLocation()
  const { isAuthenticated, isAdmin } = useAuth()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (!isAdmin) {
    return <Navigate to="/login" replace state={{ denied: true }} />
  }

  return <Outlet />
}
