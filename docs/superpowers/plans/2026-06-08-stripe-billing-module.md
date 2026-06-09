# Stripe Billing Module Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task.

**Goal:** Build a backend billing module that makes Stripe the financial source of truth while preserving the existing internal subscription model as the entitlement source.

**Tech Stack:** NestJS, Prisma, Stripe Node.js SDK, PostgreSQL

---

## File Map

### Create
- apps/backend-api/src/modules/billing/billing.module.ts
- apps/backend-api/src/modules/billing/billing.controller.ts
- apps/backend-api/src/modules/billing/webhook.controller.ts
- apps/backend-api/src/modules/billing/services/stripe.service.ts
- apps/backend-api/src/modules/billing/services/catalog.service.ts
- apps/backend-api/src/modules/billing/services/checkout.service.ts
- apps/backend-api/src/modules/billing/services/webhook.service.ts
- apps/backend-api/src/modules/billing/services/entitlement-sync.service.ts
- apps/backend-api/src/modules/billing/dto/catalog.dto.ts
- apps/backend-api/src/modules/billing/dto/checkout.dto.ts
- apps/backend-api/src/modules/billing/dto/billing-status.dto.ts
- apps/backend-api/src/modules/billing/dto/portal.dto.ts
- packages/contracts/src/billing.ts

### Modify
- apps/backend-api/package.json (add stripe)
- apps/backend-api/prisma/schema.prisma (new models + extend User/Subscription/PlanVariant)
- apps/backend-api/src/main.ts (rawBody: true)
- apps/backend-api/src/app.module.ts (register BillingModule)
- apps/backend-api/src/modules/admin/dto/plan.dto.ts (billing config fields)
- apps/backend-api/src/modules/admin/services/variant.service.ts (billing config validation)
- packages/contracts/src/index.ts (export billing)
- packages/contracts/src/admin-plans.ts (billing fields on PlanVariant)
- CONTRACTS.md, CHECKPOINT.md

---

## Task 1: Install Stripe SDK
- [ ] pnpm --filter backend-api add stripe
- [ ] pnpm --filter backend-api build

## Task 2: Prisma schema changes
- [ ] Add BillingWebhookEvent model (id, stripeEventId unique, type, apiVersion, rawPayload Json, status, failureMessage, createdAt, processedAt)
- [ ] Add BillingCheckoutSession model (id, userId, variantId, stripeSessionId unique, stripeCustomerId, status, successUrl, cancelUrl, createdAt, completedAt)
- [ ] Extend User: add stripeCustomerId String? @unique, add billingCheckoutSessions relation
- [ ] Extend Subscription: add stripeSubscriptionId, stripePriceId, stripeStatus, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd
- [ ] Extend PlanVariant: add checkoutEnabled, stripeProductId, stripePriceId, add billingCheckoutSessions relation
- [ ] Generate + migrate: prisma generate && prisma migrate dev --name add-billing-tables

## Task 3: Contract types
- [ ] Create packages/contracts/src/billing.ts with BillingCatalogItem, BillingStatusResponse, CreateCheckoutSessionRequest/Response, CheckoutSessionStatusResponse, CreatePortalSessionRequest/Response
- [ ] Add billing fields to PlanVariant in admin-plans.ts
- [ ] Export from index.ts
- [ ] Build contracts

## Task 4: StripeService (SDK wrapper)
- [ ] Create stripe.service.ts with: onModuleInit (init Stripe client), verifyWebhookSignature, createCustomer, createCheckoutSession, createPortalSession
- [ ] Uses ConfigService for STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PORTAL_CONFIGURATION_ID

## Task 5: BillingModule
- [ ] Create billing.module.ts wiring all services + controllers
- [ ] Register in AppModule

## Task 6: CatalogService + GET /billing/catalog
- [ ] Create catalog.service.ts: query active, checkoutEnabled, mapped, non-FREE, non-LIFETIME variants
- [ ] Add @Public() GET /billing/catalog to BillingController
- [ ] Build

## Task 7: GET /billing/status
- [ ] Add authenticated endpoint returning hasStripeCustomer, hasActivePaidSubscription, currentSubscription details
- [ ] Build

## Task 8: CheckoutService + POST /billing/checkout-session + GET /billing/checkout-sessions/:sessionId
- [ ] Create checkout.service.ts: validate variant, check no active paid sub, get/create Stripe customer, create local session, create Stripe Checkout Session
- [ ] Add POST /billing/checkout-session (authenticated)
- [ ] Add GET /billing/checkout-sessions/:sessionId (authenticated, own sessions only)
- [ ] Build

## Task 9: WebhookService + WebhookController
- [ ] Create webhook.service.ts: idempotency check, store event, route by type, mark PROCESSED/FAILED
- [ ] Create webhook.controller.ts: @Public() POST /billing/webhooks/stripe, verify signature, delegate to service
- [ ] Build

## Task 10: EntitlementSyncService
- [ ] Create entitlement-sync.service.ts with: syncSubscription, handleInvoicePaid, handlePaymentFailed, handleSubscriptionDeleted
- [ ] syncSubscription: upsert Stripe state, create new snapshot on variant change, update existing on renewal
- [ ] handleInvoicePaid: replenish aiCreditsRemaining
- [ ] handlePaymentFailed: mark past_due, keep entitlements
- [ ] handleSubscriptionDeleted: end paid sub, assignDefaultFreePlan fallback
- [ ] Build

## Task 11: POST /billing/customer-portal-session
- [ ] Add authenticated endpoint: check user has stripeCustomerId, create portal session
- [ ] Build

## Task 12: Admin variant billing config
- [ ] Add checkoutEnabled, stripeProductId, stripePriceId to CreateVariantDto and UpdateVariantDto
- [ ] Add validation: checkoutEnabled requires both stripeProductId and stripePriceId
- [ ] Build

## Task 13: Bootstrap rawBody
- [ ] Add { rawBody: true } to NestFactory.create in main.ts
- [ ] Build

## Task 14: Unit tests
- [ ] CatalogService: filtering excludes FREE, LIFETIME, inactive, unmapped
- [ ] CheckoutService: rejects invalid variants, existing paid subs
- [ ] WebhookService: idempotency by event ID
- [ ] EntitlementSyncService: FREE fallback, credit replenishment, status mapping
- [ ] Run: pnpm --filter backend-api test

## Task 15: Documentation + validation
- [ ] Add billing section to CONTRACTS.md
- [ ] Update CHECKPOINT.md
- [ ] pnpm --filter backend-api build && lint && test
