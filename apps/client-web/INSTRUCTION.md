# Client-Web — INSTRUCTION.md

## Module Role

User-facing Vite SPA for acquisition, authentication, checkout, and subscription management. This is an MVP acquisition/account surface, not a full web product app.

## Stack

- Vite 7
- React 19
- React Router 7
- TanStack Query 5
- Tailwind CSS v4
- shadcn/ui
- react-hook-form + zod
- react-i18next + i18next
- axios
- sonner

## Directory Structure

```
src/
  app/                  — providers, router, guards
  components/ui/        — shadcn components
  features/
    auth/               — login, signup, verify, forgot/reset password
    billing/            — pricing, checkout success/cancel
    account/            — profile, subscription management
  shared/
    lib/                — api-client (axios), api-error, query-client
    components/         — navbar, footer
  i18n/                 — en/vi translations (common, marketing, auth, billing, account)
```

## Auth Flow

- Dashboard-style localStorage model
- Access token + refresh token stored together
- Single-flight refresh on 401 (same pattern as dashboard)
- Intent persistence: storeCheckoutIntent/getCheckoutIntent via sessionStorage

## Billing Flow

- `/pricing` fetches catalog from `GET /billing/catalog`
- Authenticated users also fetch `GET /user/subscription-status`
- Checkout: `POST /billing/checkout-session` → Stripe redirect
- Success page polls `GET /billing/checkout-sessions/:sessionId`
- Portal: `POST /billing/customer-portal-session`

## Validation

- `pnpm --filter client-web build`
- `pnpm --filter client-web lint`
- `pnpm --filter client-web typecheck`
- `pnpm --filter client-web test`
