# Client-Web i18n, Routing & Layouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up i18n with en/vi translations, create 3 layouts (marketing, auth, account), configure React Router with all routes, and wire everything into App.tsx.

**Architecture:** i18n uses i18next with browser language detector and 5 namespaces (common, marketing, auth, billing, account). Three layout components wrap route groups: marketing (Navbar+Footer), auth (centered card), account (Navbar+sidebar). Router uses React Router 7's `createBrowserRouter` with nested routes and auth guards.

**Tech Stack:** i18next, react-i18next, i18next-browser-languagedetector, React Router 7

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/i18n/index.ts` | i18next initialization with detection and namespace config |
| Create | `src/i18n/en/common.json` | English common translations (brand, nav, footer, theme, language) |
| Create | `src/i18n/en/marketing.json` | English marketing page translations |
| Create | `src/i18n/en/auth.json` | English auth flow translations |
| Create | `src/i18n/en/billing.json` | English billing page translations |
| Create | `src/i18n/en/account.json` | English account page translations |
| Create | `src/i18n/vi/common.json` | Vietnamese common translations |
| Create | `src/i18n/vi/marketing.json` | Vietnamese marketing translations |
| Create | `src/i18n/vi/auth.json` | Vietnamese auth translations |
| Create | `src/i18n/vi/billing.json` | Vietnamese billing translations |
| Create | `src/i18n/vi/account.json` | Vietnamese account translations |
| Create | `src/layouts/marketing-layout.tsx` | Navbar + Outlet + Footer wrapper |
| Create | `src/layouts/auth-layout.tsx` | Centered card layout for auth forms |
| Create | `src/layouts/account-layout.tsx` | Navbar + sidebar nav + Outlet |
| Create | `src/features/marketing/pages/landing-page.tsx` | Placeholder landing page |
| Create | `src/features/marketing/pages/pricing-page.tsx` | Placeholder pricing page |
| Create | `src/features/auth/pages/login-page.tsx` | Placeholder login page |
| Create | `src/features/auth/pages/signup-page.tsx` | Placeholder signup page |
| Create | `src/features/auth/pages/verify-page.tsx` | Placeholder verify page |
| Create | `src/features/auth/pages/forgot-password-page.tsx` | Placeholder forgot password page |
| Create | `src/features/auth/pages/reset-password-page.tsx` | Placeholder reset password page |
| Create | `src/features/account/pages/account-page.tsx` | Placeholder account/profile page |
| Create | `src/features/account/pages/subscription-page.tsx` | Placeholder subscription page |
| Create | `src/features/billing/pages/billing-success-page.tsx` | Placeholder billing success page |
| Create | `src/features/billing/pages/billing-cancel-page.tsx` | Placeholder billing cancel page |
| Create | `src/features/marketing/pages/not-found-page.tsx` | Placeholder 404 page |
| Create | `src/app/router.tsx` | Router config with all routes |
| Modify | `src/App.tsx` | Wire i18n import and AppRouter |

---

### Task 1: Create i18n configuration and English translation files

**Files:**
- Create: `src/i18n/index.ts`
- Create: `src/i18n/en/common.json`
- Create: `src/i18n/en/marketing.json`
- Create: `src/i18n/en/auth.json`
- Create: `src/i18n/en/billing.json`
- Create: `src/i18n/en/account.json`

- [ ] **Step 1: Create `src/i18n/en/common.json`**

```json
{
  "brand": "Kapter",
  "nav": { "pricing": "Pricing", "login": "Log in", "signup": "Sign up", "account": "Account" },
  "footer": { "copyright": "© 2026 Kapter. All rights reserved.", "privacy": "Privacy", "terms": "Terms" },
  "theme": { "light": "Light", "dark": "Dark" },
  "language": { "en": "English", "vi": "Tiếng Việt" }
}
```

- [ ] **Step 2: Create `src/i18n/en/auth.json`**

```json
{
  "login": { "title": "Welcome back", "email": "Email", "password": "Password", "submit": "Log in", "forgotPassword": "Forgot password?", "noAccount": "Don't have an account?", "signupLink": "Sign up" },
  "signup": { "title": "Create your account", "fullName": "Full name", "email": "Email", "password": "Password", "submit": "Create account", "hasAccount": "Already have an account?", "loginLink": "Log in" },
  "verify": { "title": "Verify your email", "description": "We sent a verification code to {{email}}", "otp": "Verification code", "submit": "Verify", "resend": "Resend code" },
  "forgotPassword": { "title": "Reset your password", "description": "Enter your email and we'll send you a reset code", "email": "Email", "submit": "Send reset code", "backToLogin": "Back to login" },
  "resetPassword": { "title": "Set new password", "email": "Email", "otp": "Reset code", "newPassword": "New password", "confirmPassword": "Confirm password", "submit": "Reset password" }
}
```

- [ ] **Step 3: Create `src/i18n/en/billing.json`**

```json
{
  "pricing": { "title": "Choose your plan", "monthly": "Monthly", "yearly": "Yearly", "currentPlan": "Current plan", "upgrade": "Upgrade", "manage": "Manage", "free": "Free", "perMonth": "/month", "perYear": "/year", "faq": "Frequently asked questions" },
  "success": { "title": "Payment successful!", "description": "Your subscription is now active.", "goToAccount": "Go to account" },
  "cancel": { "title": "Payment cancelled", "description": "Your payment was not completed. No charges were made.", "backToPricing": "Back to pricing" }
}
```

- [ ] **Step 4: Create `src/i18n/en/marketing.json`**

```json
{
  "hero": { "title": "Bilingual subtitles, perfected", "subtitle": "High-accuracy transcription and translation with word-level timing for media consumption and content creation.", "cta": "Get started free" },
  "features": { "title": "Why Kapter?", "transcription": { "title": "Precise transcription", "description": "Word-level karaoke timing for immersive subtitle learning." }, "translation": { "title": "Bilingual translation", "description": "Side-by-side subtitles in your target language." }, "ai": { "title": "AI-powered", "description": "Smart explanations and vocabulary building." } },
  "howItWorks": { "title": "How it works", "step1": "Upload your media", "step2": "Get bilingual subtitles", "step3": "Learn with AI" }
}
```

- [ ] **Step 5: Create `src/i18n/en/account.json`**

```json
{
  "profile": { "title": "Profile", "email": "Email", "name": "Name", "role": "Role" },
  "subscription": { "title": "Subscription", "currentPlan": "Current plan", "status": "Status", "period": "Current period", "aiCredits": "AI credits", "quota": "Monthly quota", "manage": "Manage subscription", "upgrade": "Upgrade plan" }
}
```

- [ ] **Step 6: Create `src/i18n/index.ts`**

```ts
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import commonEn from './en/common.json'
import marketingEn from './en/marketing.json'
import authEn from './en/auth.json'
import billingEn from './en/billing.json'
import accountEn from './en/account.json'
import commonVi from './vi/common.json'
import marketingVi from './vi/marketing.json'
import authVi from './vi/auth.json'
import billingVi from './vi/billing.json'
import accountVi from './vi/account.json'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: commonEn, marketing: marketingEn, auth: authEn, billing: billingEn, account: accountEn },
      vi: { common: commonVi, marketing: marketingVi, auth: authVi, billing: billingVi, account: accountVi },
    },
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: ['common', 'marketing', 'auth', 'billing', 'account'],
    detection: { order: ['localStorage', 'navigator'], caches: ['localStorage'] },
  })

export default i18n
```

Note: This will temporarily fail because vi/ files don't exist yet. Task 2 creates them.

---

### Task 2: Create Vietnamese translation files

**Files:**
- Create: `src/i18n/vi/common.json`
- Create: `src/i18n/vi/marketing.json`
- Create: `src/i18n/vi/auth.json`
- Create: `src/i18n/vi/billing.json`
- Create: `src/i18n/vi/account.json`

- [ ] **Step 1: Create `src/i18n/vi/common.json`**

```json
{
  "brand": "Kapter",
  "nav": { "pricing": "Bảng giá", "login": "Đăng nhập", "signup": "Đăng ký", "account": "Tài khoản" },
  "footer": { "copyright": "© 2026 Kapter. Mọi quyền được bảo lưu.", "privacy": "Chính sách", "terms": "Điều khoản" },
  "theme": { "light": "Sáng", "dark": "Tối" },
  "language": { "en": "English", "vi": "Tiếng Việt" }
}
```

- [ ] **Step 2: Create `src/i18n/vi/auth.json`**

```json
{
  "login": { "title": "Chào mừng trở lại", "email": "Email", "password": "Mật khẩu", "submit": "Đăng nhập", "forgotPassword": "Quên mật khẩu?", "noAccount": "Chưa có tài khoản?", "signupLink": "Đăng ký" },
  "signup": { "title": "Tạo tài khoản", "fullName": "Họ và tên", "email": "Email", "password": "Mật khẩu", "submit": "Tạo tài khoản", "hasAccount": "Đã có tài khoản?", "loginLink": "Đăng nhập" },
  "verify": { "title": "Xác minh email", "description": "Chúng tôi đã gửi mã xác minh đến {{email}}", "otp": "Mã xác minh", "submit": "Xác minh", "resend": "Gửi lại mã" },
  "forgotPassword": { "title": "Đặt lại mật khẩu", "description": "Nhập email và chúng tôi sẽ gửi mã đặt lại", "email": "Email", "submit": "Gửi mã đặt lại", "backToLogin": "Quay lại đăng nhập" },
  "resetPassword": { "title": "Đặt mật khẩu mới", "email": "Email", "otp": "Mã đặt lại", "newPassword": "Mật khẩu mới", "confirmPassword": "Xác nhận mật khẩu", "submit": "Đặt lại mật khẩu" }
}
```

- [ ] **Step 3: Create `src/i18n/vi/billing.json`**

```json
{
  "pricing": { "title": "Chọn gói của bạn", "monthly": "Hàng tháng", "yearly": "Hàng năm", "currentPlan": "Gói hiện tại", "upgrade": "Nâng cấp", "manage": "Quản lý", "free": "Miễn phí", "perMonth": "/tháng", "perYear": "/năm", "faq": "Câu hỏi thường gặp" },
  "success": { "title": "Thanh toán thành công!", "description": "Gói đăng ký của bạn đã được kích hoạt.", "goToAccount": "Đến tài khoản" },
  "cancel": { "title": "Thanh toán đã hủy", "description": "Thanh toán của bạn chưa hoàn tất. Không có khoản phí nào được tính.", "backToPricing": "Quay lại bảng giá" }
}
```

- [ ] **Step 4: Create `src/i18n/vi/marketing.json`**

```json
{
  "hero": { "title": "Phụ đề song ngữ, hoàn hảo", "subtitle": "Phiên âm và dịch thuật chính xác cao với thời gian cấp từ cho việc tiêu thụ media và sáng tạo nội dung.", "cta": "Bắt đầu miễn phí" },
  "features": { "title": "Tại sao chọn Kapter?", "transcription": { "title": "Phiên âm chính xác", "description": "Thời gian karaoke cấp từ cho việc học phụ đề nhập vai." }, "translation": { "title": "Dịch song ngữ", "description": "Phụ đề song ngữ bên cạnh ngôn ngữ mục tiêu của bạn." }, "ai": { "title": "AI thông minh", "description": "Giải thích thông minh và xây dựng từ vựng." } },
  "howItWorks": { "title": "Cách hoạt động", "step1": "Tải lên media của bạn", "step2": "Nhận phụ đề song ngữ", "step3": "Học với AI" }
}
```

- [ ] **Step 5: Create `src/i18n/vi/account.json`**

```json
{
  "profile": { "title": "Hồ sơ", "email": "Email", "name": "Tên", "role": "Vai trò" },
  "subscription": { "title": "Gói đăng ký", "currentPlan": "Gói hiện tại", "status": "Trạng thái", "period": "Kỳ hiện tại", "aiCredits": "Tín dụng AI", "quota": "Hạn mức hàng tháng", "manage": "Quản lý gói", "upgrade": "Nâng cấp gói" }
}
```

---

### Task 3: Create layout components

**Files:**
- Create: `src/layouts/marketing-layout.tsx`
- Create: `src/layouts/auth-layout.tsx`
- Create: `src/layouts/account-layout.tsx`

- [ ] **Step 1: Create `src/layouts/marketing-layout.tsx`**

```tsx
import { Outlet } from "react-router"
import { Navbar } from "@/shared/components/navbar"
import { Footer } from "@/shared/components/footer"

export function MarketingLayout() {
  return (
    <>
      <Navbar />
      <main className="pt-24">
        <Outlet />
      </main>
      <Footer />
    </>
  )
}
```

- [ ] **Step 2: Create `src/layouts/auth-layout.tsx`**

```tsx
import { Outlet, Link } from "react-router"

export function AuthLayout() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="font-heading text-2xl font-semibold text-primary">
            Kapter
          </Link>
        </div>
        <Outlet />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `src/layouts/account-layout.tsx`**

```tsx
import { Outlet, NavLink } from "react-router"
import { Navbar } from "@/shared/components/navbar"

const navItems = [
  { to: "/account", label: "Profile", end: true },
  { to: "/account/subscription", label: "Subscription" },
]

export function AccountLayout() {
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-6xl px-6 pt-28 pb-16">
        <div className="flex flex-col gap-8 md:flex-row">
          <aside className="w-full md:w-48">
            <nav className="flex gap-2 md:flex-col">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </aside>
          <div className="flex-1">
            <Outlet />
          </div>
        </div>
      </main>
    </>
  )
}
```

---

### Task 4: Create placeholder page components

**Files:**
- Create: `src/features/marketing/pages/landing-page.tsx`
- Create: `src/features/marketing/pages/pricing-page.tsx`
- Create: `src/features/auth/pages/login-page.tsx`
- Create: `src/features/auth/pages/signup-page.tsx`
- Create: `src/features/auth/pages/verify-page.tsx`
- Create: `src/features/auth/pages/forgot-password-page.tsx`
- Create: `src/features/auth/pages/reset-password-page.tsx`
- Create: `src/features/account/pages/account-page.tsx`
- Create: `src/features/account/pages/subscription-page.tsx`
- Create: `src/features/billing/pages/billing-success-page.tsx`
- Create: `src/features/billing/pages/billing-cancel-page.tsx`
- Create: `src/features/marketing/pages/not-found-page.tsx`

- [ ] **Step 1: Create marketing pages**

`src/features/marketing/pages/landing-page.tsx`:
```tsx
export function LandingPage() {
  return <div className="p-8"><h1 className="text-2xl font-bold">Landing Page</h1></div>
}
```

`src/features/marketing/pages/pricing-page.tsx`:
```tsx
export function PricingPage() {
  return <div className="p-8"><h1 className="text-2xl font-bold">Pricing Page</h1></div>
}
```

`src/features/marketing/pages/not-found-page.tsx`:
```tsx
import { Link } from "react-router"

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-6xl font-bold">404</h1>
      <p className="text-muted-foreground">Page not found</p>
      <Link to="/" className="text-primary underline">Go home</Link>
    </div>
  )
}
```

- [ ] **Step 2: Create auth pages**

`src/features/auth/pages/login-page.tsx`:
```tsx
export function LoginPage() {
  return <div className="p-8"><h1 className="text-2xl font-bold">Login Page</h1></div>
}
```

`src/features/auth/pages/signup-page.tsx`:
```tsx
export function SignupPage() {
  return <div className="p-8"><h1 className="text-2xl font-bold">Signup Page</h1></div>
}
```

`src/features/auth/pages/verify-page.tsx`:
```tsx
export function VerifyPage() {
  return <div className="p-8"><h1 className="text-2xl font-bold">Verify Page</h1></div>
}
```

`src/features/auth/pages/forgot-password-page.tsx`:
```tsx
export function ForgotPasswordPage() {
  return <div className="p-8"><h1 className="text-2xl font-bold">Forgot Password Page</h1></div>
}
```

`src/features/auth/pages/reset-password-page.tsx`:
```tsx
export function ResetPasswordPage() {
  return <div className="p-8"><h1 className="text-2xl font-bold">Reset Password Page</h1></div>
}
```

- [ ] **Step 3: Create account and billing pages**

`src/features/account/pages/account-page.tsx`:
```tsx
export function AccountPage() {
  return <div className="p-8"><h1 className="text-2xl font-bold">Account Page</h1></div>
}
```

`src/features/account/pages/subscription-page.tsx`:
```tsx
export function SubscriptionPage() {
  return <div className="p-8"><h1 className="text-2xl font-bold">Subscription Page</h1></div>
}
```

`src/features/billing/pages/billing-success-page.tsx`:
```tsx
export function BillingSuccessPage() {
  return <div className="p-8"><h1 className="text-2xl font-bold">Billing Success Page</h1></div>
}
```

`src/features/billing/pages/billing-cancel-page.tsx`:
```tsx
export function BillingCancelPage() {
  return <div className="p-8"><h1 className="text-2xl font-bold">Billing Cancel Page</h1></div>
}
```

---

### Task 5: Create router and wire into App.tsx

**Files:**
- Create: `src/app/router.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `src/app/router.tsx`**

```tsx
import { createBrowserRouter, RouterProvider } from "react-router"
import { MarketingLayout } from "@/layouts/marketing-layout"
import { AuthLayout } from "@/layouts/auth-layout"
import { AccountLayout } from "@/layouts/account-layout"
import { RequireAuth } from "@/app/guards/require-auth"
import { RequireAnonymous } from "@/app/guards/require-anonymous"
import { LandingPage } from "@/features/marketing/pages/landing-page"
import { PricingPage } from "@/features/marketing/pages/pricing-page"
import { LoginPage } from "@/features/auth/pages/login-page"
import { SignupPage } from "@/features/auth/pages/signup-page"
import { VerifyPage } from "@/features/auth/pages/verify-page"
import { ForgotPasswordPage } from "@/features/auth/pages/forgot-password-page"
import { ResetPasswordPage } from "@/features/auth/pages/reset-password-page"
import { AccountPage } from "@/features/account/pages/account-page"
import { SubscriptionPage } from "@/features/account/pages/subscription-page"
import { BillingSuccessPage } from "@/features/billing/pages/billing-success-page"
import { BillingCancelPage } from "@/features/billing/pages/billing-cancel-page"
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
```

- [ ] **Step 2: Update `src/App.tsx`**

Replace entire file with:
```tsx
import "@/i18n"
import { AppProviders } from "@/app/providers"
import { AppRouter } from "@/app/router"

export default function App() {
  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  )
}
```

---

### Task 6: Verify build

- [ ] **Step 1: Run build**

Run: `pnpm --filter client-web build`
Expected: Success with no errors

- [ ] **Step 2: If build fails, fix issues**

Common issues to check:
- Missing exports (named vs default)
- Import path casing (Windows is case-insensitive but TypeScript may not be)
- JSON syntax errors in translation files

---

## Verification Checklist

- [ ] `src/i18n/index.ts` exists and configures i18next with 5 namespaces
- [ ] 10 translation files exist (5 en + 5 vi)
- [ ] 3 layout components exist (marketing, auth, account)
- [ ] 12 placeholder page components exist
- [ ] Router defined in `src/app/router.tsx` with all routes
- [ ] `src/App.tsx` imports `@/i18n` and renders `<AppRouter />`
- [ ] `pnpm --filter client-web build` succeeds
