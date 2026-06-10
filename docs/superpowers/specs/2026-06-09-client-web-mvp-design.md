# Client-Web MVP: Auth, Pricing, Checkout, Subscription Management — Design Spec

**Date:** 2026-06-09
**Status:** Approved for implementation
**Scope:** New `apps/client-web` Vite SPA + backend forgot/reset password companion

---

## 1. Goals

- User-facing website for acquisition, authentication, checkout, and subscription management
- Launch in VN + EN with i18n
- Reuse existing backend auth and billing system
- Add minimal backend forgot/reset password endpoints

## 2. Non-Goals

- Media library, upload, player, Explain, Word Bank
- Full web product app (MVP acquisition/account surface only)
- Guest checkout, coupons, trials, seat billing
- Dark mode default (support both, default light)

---

## 3. App Architecture

### 3.1 Stack

Vite 7, React 19, React Router 7, TanStack Query 5, Tailwind CSS v4, shadcn/ui, react-hook-form + zod, react-i18next + i18next

### 3.2 Structure

```
apps/client-web/
  src/
    main.tsx, App.tsx, index.css, lib/utils.ts
    app/
      providers.tsx, router.tsx
      guards/ (require-auth, require-anonymous)
    layouts/
      marketing-layout.tsx, auth-layout.tsx, account-layout.tsx
    components/
      ui/ (shadcn), marketing/, shared/
    features/
      auth/ (auth-api, auth-provider, auth-storage, types, pages/)
      billing/ (billing-api, billing-queries, types, pages/)
      account/ (account-api, account-queries, types, pages/)
    shared/
      lib/ (http-client, query-client)
      components/ (navbar, footer)
    i18n/
      index.ts
      en/ (common, marketing, auth, billing, account .json)
      vi/ (common, marketing, auth, billing, account .json)
```

### 3.3 Session Strategy

- Dashboard-style localStorage model
- Access token + refresh token stored together
- AuthContext owns session state
- Single-flight refresh (same pattern as dashboard)

---

## 4. Visual Design System

### 4.1 Theming

shadcn CSS variable system with `:root` (light) and `.dark` (dark) classes. Default: light.

### 4.2 Color Tokens

**Light mode:**
| Token | Value |
|-------|-------|
| --background | 210 20% 98% |
| --foreground | 222 47% 11% |
| --primary | 174 60% 32% (deep teal) |
| --primary-foreground | 0 0% 100% |
| --secondary | 174 50% 42% (lighter teal) |
| --accent | 25 95% 53% (warm orange) |
| --accent-foreground | 0 0% 100% |
| --muted | 210 15% 93% |
| --muted-foreground | 218 11% 45% |
| --card | 0 0% 100% |
| --card-foreground | 222 47% 11% |
| --border | 214 20% 90% |
| --ring | 174 60% 32% |
| --destructive | 0 84% 60% |

**Dark mode:** Adapted with darker backgrounds, lighter foregrounds, same primary/accent.

### 4.3 Typography

- **Headlines**: Newsreader (serif, editorial)
- **Body/UI**: Plus Jakarta Sans (clean sans-serif)
- Both loaded via Google Fonts

### 4.4 Style

- Bright editorial SaaS
- Subtle glass accents on hero cards, pricing highlights, nav
- Strong section rhythm, editorial spacing
- 150-250ms transitions, respect prefers-reduced-motion
- Floating sticky navbar with language switch + CTA

---

## 5. Routes

| Path | Layout | Auth | Description |
|------|--------|------|-------------|
| `/` | marketing | public | Landing page |
| `/pricing` | marketing | public | Pricing from billing catalog |
| `/login` | auth | anonymous | Email/password login |
| `/signup` | auth | anonymous | Registration form |
| `/verify` | auth | anonymous | OTP verification |
| `/forgot-password` | auth | anonymous | Email submission |
| `/reset-password` | auth | anonymous | OTP + new password |
| `/account` | account | required | Profile summary |
| `/account/subscription` | account | required | Billing/subscription management |
| `/billing/success` | account | required | Checkout success polling |
| `/billing/cancel` | account | required | Checkout cancel |

---

## 6. Backend Companion: Forgot/Reset Password

### Endpoints

**POST /auth/forgot-password**
- Request: `{ email }`
- Response: generic success message
- Behavior: if user exists, generate FORGOT_PASSWORD OTP, send mail

**POST /auth/resend-forgot-password-otp**
- Request: `{ email }`
- Response: generic success message
- Behavior: resend with cooldown (same anti-abuse as registration)

**POST /auth/reset-password**
- Request: `{ email, otp, newPassword }`
- Response: success message
- Behavior: verify OTP, update password hash, delete all refresh tokens

### Rules

- Never expose whether email exists
- Reuse existing OTP and mail infrastructure
- Keep registration verify flow unchanged

---

## 7. Billing Flow

### Pricing Page

- Fetches `GET /billing/catalog`
- If authenticated, also fetches `GET /user/subscription-status`
- Groups by plan, billing-cycle chips per plan
- Shows only purchasable recurring variants
- FREE is informational baseline, not checkout card

### Checkout

- No active paid sub → `POST /billing/checkout-session` → redirect Stripe
- Has active paid sub → redirect `/account/subscription` (portal-first)
- Store local `sessionId` in sessionStorage before Stripe redirect

### Success Page

- Reads pending `sessionId` from sessionStorage
- Polls `GET /billing/checkout-sessions/:sessionId`
- On completion, refreshes billing + subscription status

### Cancel Page

- Clears pending session state
- Routes back to pricing

### Portal

- `Manage subscription` → `POST /billing/customer-portal-session`
- Only self-serve surface for plan changes/cancel/reactivate

---

## 8. Intent Persistence

When unauthenticated user clicks plan CTA:
- Store `returnTo`, `checkoutVariantId`, source marker
- After login/verify, resume checkout automatically if pending intent exists

---

## 9. Localization

- Languages: `en`, `vi`
- Browser detection with fallback to `en`
- Store chosen language locally
- Namespaces: common, marketing, auth, billing, account

---

## 10. Testing

### Backend
- `pnpm --filter backend-api build/lint/test`
- Tests for: forgot-password generic success, resend cooldown, reset-password valid/invalid OTP, refresh token invalidation after reset

### Client-web
- `pnpm --filter client-web build/lint/typecheck`
- Manual acceptance pass (no browser test framework in phase 1)

### Manual Acceptance
- Landing/pricing render in en/vi
- Unauthenticated CTA → signup/login → checkout intent resume
- Signup → verify → checkout redirect
- Forgot → reset password with OTP
- Paid user sees Manage subscription
- Success page resolves pending session
- Account/subscription reflects backend state
- Responsive, keyboard nav, reduced motion
