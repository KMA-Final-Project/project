# Client-Web MVP Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task.

**Goal:** Build a user-facing Vite SPA for acquisition, auth, checkout, and subscription management with VN+EN i18n.

**Tech Stack:** Vite 7, React 19, React Router 7, TanStack Query 5, Tailwind CSS v4, shadcn/ui, react-hook-form + zod, react-i18next

---

## Task 1: Backend forgot/reset password endpoints
- [ ] Add POST /auth/forgot-password (generic success, send OTP if user exists)
- [ ] Add POST /auth/resend-forgot-password-otp (generic success, cooldown)
- [ ] Add POST /auth/reset-password (verify OTP, update password, delete refresh tokens)
- [ ] Add unit tests for all three endpoints
- [ ] Build + lint + test

## Task 2: Scaffold client-web app
- [ ] pnpm create vite apps/client-web --template react-ts
- [ ] Install dependencies: react-router, @tanstack/react-query, tailwindcss, shadcn, react-hook-form, zod, react-i18next, i18next, sonner, @remixicon/react
- [ ] Configure Tailwind CSS v4 with shadcn
- [ ] Initialize shadcn (npx shadcn@latest init)
- [ ] Set up project structure (app/, features/, shared/, i18n/, components/)
- [ ] Configure Vite proxy for API calls

## Task 3: Design system + theming
- [ ] Create index.css with shadcn CSS variables (light + dark mode, teal + orange palette)
- [ ] Configure Newsreader + Plus Jakarta Sans fonts
- [ ] Install shadcn components: button, card, input, label, dialog, select, tabs, badge, separator, toast, form
- [ ] Create ThemeProvider with light/dark toggle
- [ ] Build shared Navbar component (floating, sticky, language switch, auth-aware CTAs)
- [ ] Build shared Footer component

## Task 4: Auth infrastructure
- [ ] Create auth-storage.ts (localStorage model, same as dashboard)
- [ ] Create auth-provider.tsx (AuthContext with session, login, logout, refresh)
- [ ] Create http-client.ts (single-flight refresh, same pattern as dashboard)
- [ ] Create query-client.ts
- [ ] Create providers.tsx (QueryClientProvider + AuthProvider + ThemeProvider + Toaster)
- [ ] Create route guards (require-auth, require-anonymous)

## Task 5: i18n setup
- [ ] Configure i18next with browser detection, fallback to en
- [ ] Create en/common.json, en/marketing.json, en/auth.json, en/billing.json, en/account.json
- [ ] Create vi/ translations (same structure)
- [ ] Create language switch component

## Task 6: Router + layouts
- [ ] Create marketing-layout.tsx (navbar + footer + outlet)
- [ ] Create auth-layout.tsx (centered form layout)
- [ ] Create account-layout.tsx (sidebar or tab navigation)
- [ ] Create router.tsx with all routes
- [ ] Create App.tsx and main.tsx

## Task 7: Auth pages
- [ ] Create login-page.tsx (email/password form, links to signup/forgot)
- [ ] Create signup-page.tsx (fullName, email, password, route to verify)
- [ ] Create verify-page.tsx (OTP input, resend, auto-resume checkout intent)
- [ ] Create forgot-password-page.tsx (email submission, generic success)
- [ ] Create reset-password-page.tsx (email, OTP, new password, confirm)
- [ ] Wire auth API functions (login, register, verify, forgot, resend, reset)
- [ ] Implement intent persistence (returnTo, checkoutVariantId in sessionStorage)

## Task 8: Billing pages
- [ ] Create billing-api.ts (catalog, checkout, session status, portal)
- [ ] Create billing-queries.ts (query factories)
- [ ] Create pricing-page.tsx (plan cards from catalog, billing-cycle chips, FAQ)
- [ ] Create billing-success-page.tsx (poll session, refresh status)
- [ ] Create billing-cancel-page.tsx (clear session, route back)
- [ ] Wire checkout flow (authenticated CTA -> checkout-session -> Stripe redirect)
- [ ] Wire portal flow (manage subscription -> portal-session)

## Task 9: Account pages
- [ ] Create account-api.ts (profile, subscription status)
- [ ] Create account-queries.ts
- [ ] Create account-page.tsx (profile summary, plan summary, quick links)
- [ ] Create subscription-page.tsx (billing state, plan, period, credits, quota, upgrade/manage)

## Task 10: Landing page
- [ ] Create landing-page.tsx (hero, proof strip, how-it-works, features, CTA)
- [ ] Use Newsreader for headlines, Plus Jakarta Sans for body
- [ ] Responsive layout (mobile-first)
- [ ] prefers-reduced-motion support

## Task 11: Documentation + validation
- [ ] Update root workspace scripts
- [ ] Create apps/client-web/INSTRUCTION.md
- [ ] Create apps/client-web/CHECKPOINT.md
- [ ] Update PROJECT_MAP.md
- [ ] Update CONTRACTS.md (forgot/reset password endpoints)
- [ ] pnpm --filter client-web build/lint/typecheck
- [ ] pnpm --filter backend-api build/lint/test
