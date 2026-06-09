# Backend Billing Module for Stripe-Authoritative SaaS Subscriptions — Design Spec

**Date:** 2026-06-08
**Status:** Approved for implementation
**Scope:** Backend-only billing module — Stripe Checkout, Customer Portal, webhook processing, entitlement sync, admin billing config

---

## 1. Problem Statement

The backend has a fully working internal subscription model (PlanVariant → Subscription → User with snapshot pattern, FREE fallback, quota enforcement, AI credits). But there is no payment processing — users are manually assigned plans. This phase makes Stripe the financial source of truth while preserving the internal subscription model as the entitlement source.

## 2. Goals

- Stripe Checkout for authenticated paid recurring variants
- Stripe Customer Portal for self-serve management
- Stripe webhook ingestion with signature verification, idempotency, and audit logging
- Sync from Stripe lifecycle into existing internal Subscription, FREE fallback, quota visibility, and AI credit replenishment
- Public pricing/catalog APIs and authenticated billing APIs
- Admin-managed Stripe price mapping on existing plan variants

## 3. Non-Goals

- Client-web or mobile purchase handoff implementation
- Guest checkout, coupons, promo codes, trials, seat billing
- Refunds, disputes, or lifetime purchases
- Clerk integration
- Auto-creating Stripe catalog entries from admin edits

---

## 4. Architecture

### 4.1 Source of Truth Split

| Domain | Source of Truth | What It Owns |
|--------|----------------|--------------|
| Financial state | Stripe | Payment status, billing cycle, invoicing, cancellation |
| Entitlements | Internal Subscription + User | Quota limits, AI credits, upload access, snapshot fields |
| Catalog | Internal PlanVariant + admin Stripe mapping | What's purchasable, pricing display, feature definitions |

The bridge: Stripe webhook events → EntitlementSyncService → updates internal Subscription + User rows.

### 4.2 Prisma Schema Changes

**New models:**

```prisma
model BillingWebhookEvent {
  id             String   @id @default(uuid())
  stripeEventId  String   @unique @map("stripe_event_id")
  type           String
  apiVersion     String?  @map("api_version")
  rawPayload     Json     @map("raw_payload")
  status         String   @default("RECEIVED") // RECEIVED | PROCESSED | FAILED
  failureMessage String?  @map("failure_message")
  createdAt      DateTime @default(now()) @map("created_at")
  processedAt    DateTime? @map("processed_at")

  @@map("billing_webhook_events")
}

model BillingCheckoutSession {
  id              String   @id @default(uuid())
  userId          String   @map("user_id")
  variantId       String   @map("variant_id")
  stripeSessionId String   @unique @map("stripe_session_id")
  stripeCustomerId String  @map("stripe_customer_id")
  status          String   @default("PENDING") // PENDING | COMPLETED | EXPIRED | FAILED
  successUrl      String?  @map("success_url")
  cancelUrl       String?  @map("cancel_url")
  createdAt       DateTime @default(now()) @map("created_at")
  completedAt     DateTime? @map("completed_at")

  user    User        @relation(fields: [userId], references: [id])
  variant PlanVariant @relation(fields: [variantId], references: [id])

  @@map("billing_checkout_sessions")
}
```

**User model extended:**
```prisma
// Add to User model:
stripeCustomerId String? @map("stripe_customer_id") @unique
```

**Subscription model extended:**
```prisma
// Add to Subscription model:
stripeSubscriptionId String?   @map("stripe_subscription_id")
stripePriceId        String?   @map("stripe_price_id")
stripeStatus         String?   @map("stripe_status")
currentPeriodStart   DateTime? @map("current_period_start")
currentPeriodEnd     DateTime? @map("current_period_end")
cancelAtPeriodEnd    Boolean   @default(false) @map("cancel_at_period_end")
```

**PlanVariant model extended:**
```prisma
// Add to PlanVariant model:
checkoutEnabled Boolean  @default(false) @map("checkout_enabled")
stripeProductId String?  @map("stripe_product_id")
stripePriceId   String?  @map("stripe_price_id")
```

### 4.3 Module Structure

```
apps/backend-api/src/modules/billing/
  billing.module.ts
  billing.controller.ts          — authenticated endpoints
  webhook.controller.ts          — public Stripe webhook endpoint
  services/
    stripe.service.ts            — Stripe SDK wrapper (ConfigService-based)
    catalog.service.ts           — checkout-eligible variant filtering
    checkout.service.ts          — session creation + customer management
    webhook.service.ts           — event verification, idempotency, routing
    entitlement-sync.service.ts  — Stripe → internal subscription/credit sync
  dto/
    catalog.dto.ts
    checkout.dto.ts
    billing-status.dto.ts
    portal.dto.ts
    admin-variant-billing.dto.ts
```

---

## 5. API Endpoints

### 5.1 Public (no JWT)

**GET /billing/catalog**
- Returns checkout-eligible recurring paid variants
- Excludes FREE, LIFETIME, inactive, and unmapped variants
- Response: array of `{ planCode, planName, variantId, variantName, price, currency, billingCycleType, monthlyQuotaSeconds, maxDurationPerFile, aiCreditsPerMonth }`

**POST /billing/webhooks/stripe**
- `@Public()` — Stripe signature verification is the security
- Uses `req.rawBody` (Buffer) for `stripe.webhooks.constructEvent()`
- Idempotent by `stripeEventId`
- Returns `{ received: true }` on success, 400 on signature failure

### 5.2 Authenticated (JWT required)

**GET /billing/status**
- Returns current billing state for the authenticated user
- Response: `{ hasStripeCustomer, hasActivePaidSubscription, stripeCustomerId, currentSubscription: { variantId, planName, status, stripeStatus, cancelAtPeriodEnd, currentPeriodEnd } }`

**POST /billing/checkout-session**
- Request: `{ variantId, successUrl, cancelUrl }`
- Validates: variant exists, active, recurring, mapped, checkoutEnabled, user has no active paid Stripe sub
- Creates/reuses Stripe customer, creates local session, creates Stripe Checkout Session
- Response: `{ checkoutUrl, sessionId }`

**GET /billing/checkout-sessions/:sessionId**
- Returns local session state + synced billing outcome
- Response: `{ sessionId, status, variantId, completedAt }`

**POST /billing/customer-portal-session**
- Request: `{ returnUrl }`
- Requires user with existing Stripe customer
- Creates Stripe billing portal session
- Response: `{ url }`

### 5.3 Admin (existing variant management extended)

PlanVariant create/update DTOs extended with optional billing fields:
- `checkoutEnabled` (boolean)
- `stripeProductId` (string)
- `stripePriceId` (string)

Validation rules:
- Only recurring non-FREE variants may have `checkoutEnabled=true`
- `checkoutEnabled=true` requires both `stripeProductId` and `stripePriceId`

---

## 6. Checkout Flow

```
Client (authenticated)                Backend                    Stripe
      |                                 |                          |
      |-- POST /billing/checkout ------>|                          |
      |                                 |                          |
      |                                 |-- validate variant      |
      |                                 |-- check no active paid  |
      |                                 |-- get/create customer   |
      |                                 |-- create local session  |
      |                                 |-- stripe.checkout.      |
      |                                 |   sessions.create() -->|
      |<-- { checkoutUrl, sessionId } --|<-- session URL ---------|
```

Customer reuse: if `User.stripeCustomerId` exists, reuse it. Otherwise, call `stripe.customers.create()` with `email`, `metadata: { internalUserId }`, and persist the ID on User.

---

## 7. Webhook Event Processing

| Stripe Event | Action |
|---|---|
| `checkout.session.completed` | Mark local session COMPLETED. Persist customer/subscription linkage. |
| `checkout.session.expired` | Mark local session EXPIRED. |
| `customer.subscription.created` | Upsert Stripe sub state on internal Subscription. Sync variant, period, status. |
| `customer.subscription.updated` | Same as created. Apply immediate upgrades. Preserve entitlements during cancel_at_period_end. |
| `invoice.paid` | Renewal. Refresh period. Replenish `aiCreditsRemaining`. |
| `invoice.payment_failed` | Mark past_due. Do NOT remove entitlements. |
| `customer.subscription.deleted` | End paid subscription. Auto-fallback to FREE. Reset credits. |

---

## 8. Entitlement Sync Rules

| Scenario | Action |
|---|---|
| FREE → paid | Create new internal Subscription snapshot, set as `currentSubscriptionId` |
| Same variant renewal | Update dates/status on existing internal row |
| Variant change (upgrade/downgrade) | Create new internal Subscription snapshot |
| Paid → end (deleted) | Mark paid row ended, create new FREE snapshot as current |
| AI credits | Replaced with target plan's `aiCreditsPerMonth` on activation, renewal, upgrade, and FREE fallback |

Key policy: **immediate upgrade, deferred downgrade**. When Stripe applies a price change (e.g., at period end), the internal entitlement updates when Stripe confirms the change, not when requested.

---

## 9. ConfigService Keys

| Key | Required | Description |
|---|---|---|
| `STRIPE_SECRET_KEY` | Yes | Stripe API secret key |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook endpoint signing secret |
| `STRIPE_PORTAL_CONFIGURATION_ID` | Yes | Stripe billing portal configuration ID |
| `STRIPE_ALLOWED_ORIGINS` | Yes | Comma-separated allowed success/cancel URL origins |

---

## 10. Bootstrap Change

Add `rawBody: true` to `NestFactory.create()` in `main.ts`. This enables `req.rawBody` (Buffer) for Stripe signature verification. Existing JSON parsing continues to work for all other endpoints.

---

## 11. Error Handling

- **Invalid variant** (not found, inactive, FREE, LIFETIME, unmapped): 400 with descriptive message
- **User has active paid sub**: 400 with message directing to portal
- **Missing Stripe customer for portal**: 400
- **Stripe API errors**: caught and rethrown as NestJS exceptions with Stripe error message
- **Webhook signature failure**: 400, event not stored
- **Webhook processing failure**: event stored with status=FAILED and failureMessage, still return 200 to Stripe (don't retry)
- **Duplicate webhook event**: return 200 immediately (idempotent)

---

## 12. Testing Strategy

### Backend Unit Tests
- Catalog filtering excludes FREE, LIFETIME, inactive, and unmapped variants
- Checkout creation rejects invalid variants and existing active paid subscribers
- Stripe customer reuse logic
- Webhook processor is idempotent by Stripe event ID
- Subscription status mapping handles active, past_due, cancel_at_period_end, deleted
- FREE fallback assigns new FREE snapshot row and updates currentSubscriptionId
- AI credits replaced with target plan allowance on activation, renewal, upgrade, FREE fallback

### Validation Commands
- `pnpm --filter backend-api build`
- `pnpm --filter backend-api lint`
- `pnpm --filter backend-api test`

### Manual Validation
- Stripe CLI webhook replay against local backend
- Checkout completion, renewal replay, payment failure replay, cancellation replay, duplicate-event replay
