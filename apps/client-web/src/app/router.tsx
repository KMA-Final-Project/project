import { createBrowserRouter, RouterProvider } from "react-router"
import { MarketingLayout } from "@/layouts/marketing-layout"
import { AuthLayout } from "@/layouts/auth-layout"
import { AccountLayout } from "@/layouts/account-layout"
import { RequireAuth } from "@/app/guards/require-auth"
import { RequireAnonymous } from "@/app/guards/require-anonymous"
import { LandingPage } from "@/features/marketing/pages/landing-page"
import { PricingPage } from "@/features/billing/pages/pricing-page.tsx"
import { LoginPage } from "@/features/auth/pages/login-page"
import { SignupPage } from "@/features/auth/pages/signup-page"
import { VerifyPage } from "@/features/auth/pages/verify-page"
import { ForgotPasswordPage } from "@/features/auth/pages/forgot-password-page"
import { ResetPasswordPage } from "@/features/auth/pages/reset-password-page"
import { AccountPage } from "@/features/account/pages/account-page"
import { SubscriptionPage } from "@/features/account/pages/subscription-page"
import { BillingSuccessPage } from "@/features/billing/pages/billing-success-page"
import { BillingCancelPage } from "@/features/billing/pages/billing-cancel-page"
import { HandoffPage } from "@/features/auth/pages/handoff-page.tsx"
import { NotFoundPage } from "@/features/marketing/pages/not-found-page"

const router = createBrowserRouter([
  {
    path: "/",
    element: <MarketingLayout />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: "pricing", element: <PricingPage /> },
    ],
  },
  { path: "/handoff", element: <HandoffPage /> },
  {
    element: <RequireAnonymous />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          { path: "login", element: <LoginPage /> },
          { path: "signup", element: <SignupPage /> },
          { path: "verify", element: <VerifyPage /> },
          { path: "forgot-password", element: <ForgotPasswordPage /> },
          { path: "reset-password", element: <ResetPasswordPage /> },
        ],
      },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AccountLayout />,
        children: [
          { path: "account", element: <AccountPage /> },
          { path: "account/subscription", element: <SubscriptionPage /> },
        ],
      },
      { path: "billing/success", element: <BillingSuccessPage /> },
      { path: "billing/cancel", element: <BillingCancelPage /> },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
])

export const AppRouter = () => <RouterProvider router={router} />
