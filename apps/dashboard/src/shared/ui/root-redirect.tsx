import { Navigate } from "react-router"

import { useAuth } from "@/features/auth/auth-provider.tsx"

export const RootRedirect = () => {
  const { isAuthenticated, isAdmin } = useAuth()

  if (isAuthenticated && isAdmin) {
    return <Navigate to="/overview" replace />
  }

  return <Navigate to="/login" replace />
}
