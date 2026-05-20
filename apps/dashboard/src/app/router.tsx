import { RouterProvider, createBrowserRouter } from "react-router"

import { AdminLayout } from "@/app/layouts/admin-layout.tsx"
import { AuthLayout } from "@/app/layouts/auth-layout.tsx"
import { RequireAdmin } from "@/app/guards/require-admin.tsx"
import { RequireAnonymous } from "@/app/guards/require-anonymous.tsx"
import { LoginPage } from "@/features/auth/pages/login-page.tsx"
import { MonitoringFailuresPage } from "@/features/monitoring/pages/monitoring-failures-page.tsx"
import { MonitoringQueuesPage } from "@/features/monitoring/pages/monitoring-queues-page.tsx"
import { OverviewPage } from "@/features/overview/pages/overview-page.tsx"
import { PlansPage } from "@/features/plans/pages/plans-page.tsx"
import { UsersPage } from "@/features/users/pages/users-page.tsx"
import { UserDetailPage } from "@/features/users/pages/user-detail-page.tsx"
import { NotFoundPage } from "@/shared/ui/not-found-page.tsx"
import { RootRedirect } from "@/shared/ui/root-redirect.tsx"

const router = createBrowserRouter([
  {
    path: "/",
    element: <RootRedirect />,
  },
  {
    element: <RequireAnonymous />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          {
            path: "/login",
            element: <LoginPage />,
          },
        ],
      },
    ],
  },
  {
    element: <RequireAdmin />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          {
            path: "/overview",
            element: <OverviewPage />,
          },
          {
            path: "/users",
            element: <UsersPage />,
          },
          {
            path: "/users/:id",
            element: <UserDetailPage />,
          },
          {
            path: "/plans",
            element: <PlansPage />,
          },
          {
            path: "/monitoring/queues",
            element: <MonitoringQueuesPage />,
          },
          {
            path: "/monitoring/failures",
            element: <MonitoringFailuresPage />,
          },
        ],
      },
    ],
  },
  {
    path: "*",
    element: <NotFoundPage />,
  },
])

export const AppRouter = () => {
  return <RouterProvider router={router} />
}
