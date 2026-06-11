# Mobile Integration with Web Billing — Design Spec

**Date:** 2026-06-10
**Status:** Approved for implementation
**Scope:** Mobile-to-web billing handoff via one-time token, post-return state sync

---

## 1. Goals

- Mobile subscription screen opens web billing in in-app browser
- Automatic authentication via one-time handoff token
- Post-return state sync on mobile subscription screen
- No direct Stripe integration on mobile

## 2. Non-Goals

- Full web auth browsing from arbitrary mobile screens
- Custom WebView (use Expo WebBrowser)
- Changes to upload gating, fail-code mapping, or local blocker routing

---

## 3. Architecture

### 3.1 Flow

```
Mobile Subscription Screen
  |
  |-- hasActivePaidSubscription? --> target = "account-subscription"
  |-- else ----------------------> target = "pricing"
  |
  |-- POST /auth/mobile-web-handoff { target }
  |<-- { handoffUrl, expiresInSeconds }
  |
  |-- WebBrowser.openAuthSessionAsync(handoffUrl, "mobileapp://subscription?refreshBilling=1")
  |
  [Web opens /handoff route]
  |-- POST /auth/mobile-web-handoff/consume { token }
  |<-- AuthResponse { user, tokens }
  |-- authStorage.set(session)
  |-- redirect to /pricing?fromMobile=1 or /account/subscription?fromMobile=1
  |
  [User completes checkout or views account]
  |-- "Return to app" button -> mobileapp://subscription?refreshBilling=1&context=...
  |
  [Mobile receives callback]
  |-- invalidates subscription-status + billing-status queries
  |-- shows success toast if context=checkout-success
```

### 3.2 Handoff Token

- Format: UUID v4
- Storage: Redis key `mobile-handoff:{token}`, value `{ userId, target }`, TTL 120s
- Consume-once: first successful consume deletes the key, retries fail
- Target values: `"pricing"` | `"account-subscription"`

---

## 4. Backend Changes

### 4.1 New Endpoints

**POST /auth/mobile-web-handoff** (authenticated)
- Request: `{ target: "pricing" | "account-subscription" }`
- Response: `{ handoffUrl: string, expiresInSeconds: 120 }`
- Creates token, stores in Redis, builds URL from `CLIENT_WEB_BASE_URL`

**POST /auth/mobile-web-handoff/consume** (public)
- Request: `{ token: string }`
- Response: `AuthResponse { user, tokens }`
- Looks up token in Redis, deletes on success
- Rejects expired/consumed tokens

### 4.2 Config

- `CLIENT_WEB_BASE_URL` — e.g. `http://localhost:5173` or `https://app.kapter.com`

### 4.3 Contracts

Add to `packages/contracts`:
- `MobileWebHandoffRequest { target: "pricing" | "account-subscription" }`
- `MobileWebHandoffResponse { handoffUrl: string, expiresInSeconds: number }`
- `MobileWebHandoffConsumeRequest { token: string }`

---

## 5. Client-Web Changes

### 5.1 New Route: /handoff

- Public route (no auth guard)
- Reads `token`, `target`, `fromMobile` from search params
- Calls `POST /auth/mobile-web-handhand/consume`
- On success: stores session, redirects to target with `?fromMobile=1`
- On failure: redirects to `/login?fromMobile=1&returnTo=/pricing`

### 5.2 Return to App Button

Visible on these pages when `fromMobile=1` is in the URL:
- `/pricing`
- `/account/subscription`
- `/billing/success`
- `/billing/cancel`

Button behavior:
- Reads `VITE_MOBILE_APP_RETURN_URL` env var (e.g. `mobileapp://subscription`)
- Appends `?refreshBilling=1&context=checkout-success|checkout-cancel|account`
- Uses `window.location.assign(returnUrl)`

### 5.3 Checkout Flow Preservation

- Checkout success/cancel URLs include `fromMobile=1` when user came from mobile
- Stripe Portal return URL: `/account/subscription?fromMobile=1`
- `fromMobile=1` preserved through login/signup/verify fallback paths

---

## 6. Mobile Changes

### 6.1 Billing Handoff Service

Create `src/services/billing-handoff.service.ts`:
- `openBilling(target: "pricing" | "account-subscription")` 
  - Calls `POST /auth/mobile-web-handoff`
  - Opens URL with `WebBrowser.openAuthSessionAsync(handoffUrl, callbackUrl)`
  - Callback: `mobileapp://subscription?refreshBilling=1`
  - On return: invalidates queries

### 6.2 Subscription Screen Updates

- Replace "Coming Soon" modal with real handoff flow
- Paid users: primary CTA = "Manage on website" (target: account-subscription)
- Free users: upgrade CTAs open website pricing (target: pricing)
- Non-current plan cards for paid users: route to manage path (not direct checkout, since backend blocks active-paid checkout)

### 6.3 Return Handling

- Subscription screen reads `refreshBilling=1` and `context` from route params
- On mount/focus with `refreshBilling=1`: force-invalidate `subscription-status` and `billing-status`
- Show success toast only for `context=checkout-success`
- `checkout-cancel` and `account` returns refresh silently

### 6.4 Billing Status Hook

Add `useBillingStatus()` hook:
- Calls `GET /billing/status`
- Returns `{ hasStripeCustomer, hasActivePaidSubscription, currentSubscription }`
- Used to decide: unpaid → pricing, paid → account-subscription

---

## 7. Error Handling

- **Token expired**: redirect to `/login?fromMobile=1`
- **Token already consumed**: redirect to `/login?fromMobile=1`
- **WebBrowser closed without completing**: mobile stays on subscription screen, no state change
- **Stripe Portal return**: always lands on `/account/subscription?fromMobile=1`

---

## 8. Testing

### Backend
- Create handoff URL for both targets
- Reject invalid targets
- Consume valid token once, receive AuthResponse
- Reject expired token
- Reject already-consumed token

### Client-web
- /handoff stores session and redirects correctly
- Failed consume falls back to login
- Return to app button visible when fromMobile=1
- Checkout URLs preserve fromMobile=1

### Mobile
- Free user → pricing handoff
- Paid user → account-subscription handoff
- Return from web invalidates queries
- checkout-success shows toast
- checkout-cancel refreshes silently
