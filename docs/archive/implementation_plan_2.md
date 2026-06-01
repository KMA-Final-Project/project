# RevenueCat In-App Purchase — End-to-End Implementation Plan

## Background

Kapter already has a robust subscription/quota system: Prisma models for `SubscriptionPlan`, `PlanVariant`, `Subscription`, `UsageHistory`; a `UserSubscriptionService` that applies the Snapshot Pattern; and per-file/monthly quota enforcement in the NestJS validation worker.

The goal of this plan is to wire **real money** behind those models by:
1. Accepting Apple/Google purchases through RevenueCat's webhook.
2. Atomically upgrading the user's `Subscription` and `User.role` inside a Prisma transaction.
3. Protecting the quota-deduction path in the AI validation worker with row-level locking.
4. Surfacing a native paywall in the Expo mobile app via `react-native-purchases`.

---

## Task 1 — RevenueCat Setup & Configuration

### 1.1 RevenueCat Dashboard

| Step | Detail |
|---|---|
| Create Project | One project: **Kapter**. |
| Add Apps | iOS (bundle ID) + Android (package name). |
| Create Entitlements | `pro` — maps to any paid offering. |
| Create Products | Mirror every `PlanVariant` code (`PRO_MONTHLY`, `PRO_YEARLY`, `PRO_LIFETIME`). |
| Create Offerings | At least one `default` offering bundling the products. |
| Configure Webhook | `POST https://api.kapter.app/webhooks/revenuecat`. Set the **Authorization** header secret. Enable events: `INITIAL_PURCHASE`, `RENEWAL`, `CANCELLATION`, `EXPIRATION`, `BILLING_ISSUE`. |
| Set Shared Secret | Copy the webhook signing secret into backend `.env` → `REVENUECAT_WEBHOOK_SECRET`. |

### 1.2 Apple App Store Connect

1. In **In-App Purchases**, create Auto-Renewable Subscriptions matching each `PlanVariant` product ID.
2. Under **App Store Connect API**, add a shared secret and paste it into RevenueCat's iOS App settings.
3. Enable **Subscription Groups** and set the correct entitlement mapping in RevenueCat.

### 1.3 Google Play Console

1. In **Monetize → Subscriptions**, create each SKU matching product IDs in RevenueCat.
2. In RevenueCat's Android App settings, upload the Google Play **JSON service account key** (with the Billing permission).
3. Enable **Real-time Developer Notifications** (RTDN) and paste the RevenueCat Pub/Sub topic.

### 1.4 Expo / react-native-purchases Initialization

`react-native-purchases` requires native code — **Expo Go will not work**. The team must use `expo-dev-client` or `expo run:android` / `expo run:ios`.

```ts
// src/entry.ts  (call before app renders)
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { Platform } from 'react-native';
import { REVENUECAT_IOS_KEY, REVENUECAT_ANDROID_KEY } from '@env'; // react-native-dotenv

export function initRevenueCat(userId: string) {
  if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);

  const apiKey = Platform.OS === 'ios' ? REVENUECAT_IOS_KEY : REVENUECAT_ANDROID_KEY;
  Purchases.configure({ apiKey, appUserID: userId });
}
```

Call `initRevenueCat(user.id)` after the Zustand auth store resolves the user, i.e., in `src/app/_layout.tsx` once `user` is populated — the `userId` must be your backend UUID so RevenueCat and your DB stay in sync.

---

## Task 2 — Schema Updates

### 2.1 Assumptions

- `Subscription.status` already has `ACTIVE | EXPIRED | CANCELLED`. No change needed.
- `User.role` is `USER | ADMIN`. For subscription tiers we rely on `User.currentSubscriptionId` → `Subscription` → `PlanVariant` → `SubscriptionPlan.tierLevel`. **No new `Role` values needed.**
- We do need to track RevenueCat's `app_user_id` and `original_transaction_id` on `Subscription` for reconciliation.
- We need a `WebhookEvent` idempotency table.

### 2.2 Proposed Schema Additions

```prisma
// ── NEW: Idempotency store for RevenueCat webhook events ──────────────────────
model WebhookEvent {
  id        String   @id @default(uuid())
  /// RevenueCat event ID — guaranteed unique per delivery.
  eventId   String   @unique @map("event_id")
  eventType String   @map("event_type")          // e.g. "INITIAL_PURCHASE"
  processedAt DateTime @default(now()) @map("processed_at")

  @@index([eventId])
  @@map("webhook_events")
}

// ── MODIFY: Subscription — add RevenueCat reconciliation fields ──────────────
model Subscription {
  // ... existing fields unchanged ...

  /// RevenueCat App User ID at purchase time.
  revenuecatUserId       String?  @map("revenuecat_user_id")
  /// RevenueCat original_transaction_id (stable across renewals on iOS).
  originalTransactionId  String?  @unique @map("original_transaction_id")

  // ... rest unchanged ...
}
```

**What stays the same:** The Snapshot Pattern, `PlanVariant.monthlyQuotaSeconds`, `User.quotaUsageCurrentMonthSeconds`, `UsageHistory`, soft deletes — all untouched.

> [!IMPORTANT]
> This is a cross-module contract change per CONTRACTS.md §11. Run `pnpm pmigrate:dev add_webhook_events_revenuecat_fields` and commit the migration file before writing any service code.

---

## Task 3 — NestJS Backend Logic

### 3.1 Module Structure

```text
src/modules/
└── webhooks/
    ├── webhooks.module.ts
    ├── webhooks.controller.ts       # POST /webhooks/revenuecat
    ├── revenuecat-webhook.service.ts
    └── dto/
        └── revenuecat-event.dto.ts
```

### 3.2 Controller — Signature Verification & Routing

```ts
// webhooks.controller.ts
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly rcService: RevenuecatWebhookService) {}

  @Post('revenuecat')
  @HttpCode(HttpStatus.OK)
  async handleRevenueCat(
    @Headers('authorization') authHeader: string,
    @Body() body: RevenueCatEventDto,
  ) {
    this.rcService.verifySecret(authHeader); // throws 401 on mismatch
    return this.rcService.processEvent(body);
  }
}
```

The controller must **not** use `JwtAuthGuard` — RevenueCat is an unauthenticated external caller.

### 3.3 Service — Idempotency + ACID Transaction

```ts
// revenuecat-webhook.service.ts  (key logic)

async processEvent(event: RevenueCatEventDto): Promise<void> {
  // ── STEP 1: Idempotency guard ────────────────────────────────────────────
  // Attempt to insert the event ID. If it already exists the unique
  // constraint throws P2002 — we catch it and return 200 immediately.
  try {
    await this.prisma.webhookEvent.create({
      data: { eventId: event.id, eventType: event.type },
    });
  } catch (err) {
    if (err?.code === 'P2002') {
      this.logger.warn(`Duplicate webhook event ${event.id} — skipping`);
      return; // 200 OK, no further work
    }
    throw err; // surface unexpected errors as 500
  }

  // ── STEP 2: Route by event type ─────────────────────────────────────────
  switch (event.type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
      await this.handlePurchase(event);
      break;
    case 'CANCELLATION':
    case 'EXPIRATION':
    case 'BILLING_ISSUE':
      await this.handleExpiry(event);
      break;
    default:
      this.logger.log(`Unhandled RevenueCat event type: ${event.type}`);
  }
}
```

### 3.4 ACID Transaction — Subscription Upgrade

```ts
// revenuecat-webhook.service.ts
private async handlePurchase(event: RevenueCatEventDto): Promise<void> {
  const { app_user_id, product_id, original_transaction_id,
          expiration_at_ms, purchase_at_ms } = event;

  // Find the matching PlanVariant by RevenueCat product_id
  const variant = await this.prisma.planVariant.findFirstOrThrow({
    where: { id: product_id, isActive: true }, // product_id maps to PlanVariant.id
    include: { plan: true },
  });

  await this.prisma.$transaction(async (tx) => {
    // 1. Expire any existing active subscription for this user
    await tx.subscription.updateMany({
      where: { userId: app_user_id, status: 'ACTIVE' },
      data: { status: 'EXPIRED' },
    });

    // 2. Create the new subscription (Snapshot Pattern)
    const newSub = await tx.subscription.create({
      data: {
        userId: app_user_id,
        variantId: variant.id,
        startDate: new Date(purchase_at_ms),
        endDate: expiration_at_ms ? new Date(expiration_at_ms) : new Date('9999-12-31'),
        status: 'ACTIVE',
        priceSnapshot: variant.price,
        monthlyQuotaSecondsSnapshot: variant.monthlyQuotaSeconds,
        maxDurationPerFileSnapshot: variant.maxDurationPerFile,
        revenuecatUserId: app_user_id,
        originalTransactionId: original_transaction_id,
      },
    });

    // 3. Update user pointer + reset monthly quota counter
    await tx.user.update({
      where: { id: app_user_id },
      data: {
        currentSubscriptionId: newSub.id,
        // Reset counter so the user immediately benefits from the new quota
        quotaUsageCurrentMonthSeconds: 0,
        lastQuotaResetDate: new Date(),
      },
    });
  });

  this.logger.log(`Upgraded user ${app_user_id} to plan ${variant.plan.code}`);
}
```

**Why this is ACID-safe:** All three writes happen in a single Prisma `$transaction`. If any write fails, the entire transaction rolls back — no partial upgrades.

### 3.5 Row-Level Locking — AI Validation Worker Quota Deduction

The validation worker (`apps/backend-api/src/modules/media/workers/`) calls `quotaUsageCurrentMonthSeconds += durationSeconds`. Under concurrent job processing this is a classic lost-update race.

The fix is `SELECT ... FOR UPDATE` on the `User` row before the deduction:

```ts
// In MediaProcessor (worker), inside the existing validation flow

private async deductQuota(
  tx: Prisma.TransactionClient,
  userId: string,
  durationSeconds: number,
): Promise<void> {
  // Acquire an exclusive row-level lock on the user row.
  // Concurrent transactions will queue behind this one.
  await tx.$queryRaw`
    SELECT id FROM users WHERE id = ${userId} FOR UPDATE
  `;

  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });

  await tx.user.update({
    where: { id: userId },
    data: {
      quotaUsageCurrentMonthSeconds:
        user.quotaUsageCurrentMonthSeconds + durationSeconds,
      quotaUsageCurrentMonth: user.quotaUsageCurrentMonth + 1,
    },
  });
}
```

**Usage pattern in the worker:**
```ts
await this.prisma.$transaction(async (tx) => {
  await this.deductQuota(tx, userId, durationSeconds);
  await tx.mediaItem.update({
    where: { id: mediaId },
    data: { countedInQuota: true },
  });
});
```

> [!WARNING]
> `FOR UPDATE` only provides safety **inside a transaction**. Never call `deductQuota` outside of `prisma.$transaction`.

---

## Task 4 — Sequential MVP Implementation Plan

### Phase 1 — Schema Changes & DB Migration

- [ ] **1.1** Add `WebhookEvent` model to `schema.prisma` (fields: `id`, `eventId @unique`, `eventType`, `processedAt`).
- [ ] **1.2** Add `revenuecatUserId` and `originalTransactionId @unique` to `Subscription` model.
- [ ] **1.3** Run `pnpm pmigrate:dev add_webhook_events_revenuecat_fields` in `apps/backend-api`.
- [ ] **1.4** Run `pnpm pgen` to regenerate Prisma Client.
- [ ] **1.5** Run `pnpm build` and `pnpm lint` — confirm 0 errors before moving on.
- [ ] **1.6** Update `CONTRACTS.md §11` and `backend-api/CHECKPOINT.md` with the schema change.

---

### Phase 2 — NestJS Webhook Endpoint & Transaction Services

- [ ] **2.1** Add `REVENUECAT_WEBHOOK_SECRET` to `.env` and `ConfigModule` namespace.
- [ ] **2.2** Create `src/modules/webhooks/` directory with:
  - `revenuecat-event.dto.ts` — DTO validating RevenueCat event shape.
  - `revenuecat-webhook.service.ts` — idempotency + routing + transaction logic.
  - `webhooks.controller.ts` — `POST /webhooks/revenuecat`, no JWT guard.
  - `webhooks.module.ts` — imports `PrismaModule`, registers service + controller.
- [ ] **2.3** Register `WebhooksModule` in `app.module.ts`.
- [ ] **2.4** Implement `verifySecret()` — compare `Authorization` header to `REVENUECAT_WEBHOOK_SECRET` using `timingSafeEqual` to prevent timing attacks.
- [ ] **2.5** Implement `processEvent()` with the `WebhookEvent` idempotency guard (catch `P2002`).
- [ ] **2.6** Implement `handlePurchase()` with the full `$transaction` (expire old sub → create new sub with snapshot → update user pointer + reset quota).
- [ ] **2.7** Implement `handleExpiry()` — set `Subscription.status = CANCELLED/EXPIRED`, update `User.currentSubscriptionId` back to the FREE subscription (or null).
- [ ] **2.8** Add the row-level lock helper `deductQuota()` to the existing `MediaProcessor` validation worker and wrap the existing quota-deduction block in a `$transaction` if it is not already.
- [ ] **2.9** Write unit tests for `processEvent` idempotency (duplicate event → no-op), `handlePurchase` (new sub created + old expired), and `verifySecret` (wrong secret → 401).
- [ ] **2.10** Run `pnpm build`, `pnpm lint`, `pnpm test`.

---

### Phase 3 — RevenueCat Dashboard Configuration

- [ ] **3.1** Create RevenueCat project **Kapter** and add iOS + Android apps.
- [ ] **3.2** Create Entitlement `pro`.
- [ ] **3.3** Create Products matching each `PlanVariant` code (e.g. `kapter_pro_monthly`, `kapter_pro_yearly`).
- [ ] **3.4** Create at least one Offering `default` bundling the products into packages (`$rc_monthly`, `$rc_annual`).
- [ ] **3.5** Configure the Webhook URL and secret; save the secret to `.env` → `REVENUECAT_WEBHOOK_SECRET`.
- [ ] **3.6** In Apple App Store Connect — create matching Auto-Renewable Subscriptions, set up shared secret, and enter it in RevenueCat.
- [ ] **3.7** In Google Play Console — create matching subscriptions, upload service account JSON to RevenueCat, enable RTDN.
- [ ] **3.8** In RevenueCat **Events** tab — trigger a test event against the staging backend and confirm idempotency behavior (send twice, check DB only has one `WebhookEvent` row).

---

### Phase 4 — Expo Frontend Integration

- [ ] **4.1** Install native dependency:
  ```
  pnpm add react-native-purchases react-native-purchases-ui
  npx expo install expo-dev-client
  ```
- [ ] **4.2** Add RevenueCat API keys to `.env`:
  ```
  REVENUECAT_IOS_KEY=appl_xxx
  REVENUECAT_ANDROID_KEY=goog_xxx
  ```
- [ ] **4.3** Call `initRevenueCat(user.id)` in `src/app/_layout.tsx` immediately after the auth store resolves the user (not in `entry.ts` — we need `user.id` first).
- [ ] **4.4** Create `src/services/purchases.service.ts` with:
  - `fetchOfferings()` — wraps `Purchases.getOfferings()`.
  - `purchasePackage(pkg)` — wraps `Purchases.purchasePackage(pkg)`.
  - `restorePurchases()` — wraps `Purchases.restorePurchases()`.
  - `getCustomerInfo()` — wraps `Purchases.getCustomerInfo()`.
- [ ] **4.5** Create `src/hooks/useSubscription.ts` — a TanStack Query hook that fetches `CustomerInfo` and maps the `pro` entitlement to a local `isPro: boolean`.
- [ ] **4.6** Add a **Paywall** route: `src/app/(app)/paywall.tsx`.
  - Fetch offerings with `fetchOfferings()`.
  - Render monthly/annual packages with pricing.
  - On package press → `purchasePackage(pkg)` → on success, invalidate `useSubscription` cache and navigate back.
  - Add a "Restore purchases" text button.
  - Gate the route behind the `JwtAuthGuard`-equivalent route guard (user must be logged in).
- [ ] **4.7** In `src/app/(app)/settings.tsx` — show current subscription tier from `useSubscription`; add an "Upgrade to Pro" button that navigates to `/paywall`.
- [ ] **4.8** Add i18n strings to `src/i18n/locales/vi.json` and `en.json` for paywall text.
- [ ] **4.9** Run `pnpm lint` and `pnpm tsc --noEmit`.
- [ ] **4.10** Test on a real device or simulator with a development build (`pnpm android` / `pnpm ios`) using RevenueCat's sandbox credentials.

---

## Open Questions

> [!IMPORTANT]
> **Q1 — Product ID mapping strategy:** Should `PlanVariant.id` directly equal the RevenueCat product identifier (e.g., `kapter_pro_monthly`), or should we add a separate `revenuecatProductId` column to `PlanVariant`? A dedicated column is cleaner but adds a migration field. Currently the plan assumes a direct match.

> [!IMPORTANT]
> **Q2 — User ID in RevenueCat:** RevenueCat's `app_user_id` must equal your backend `User.id` UUID. This requires calling `Purchases.logIn(user.id)` after auth. Do you also want anonymous pre-login tracking with `Purchases.logInAnonymous()` on app start?

> [!IMPORTANT]
> **Q3 — Quota reset on upgrade:** The proposed transaction resets `quotaUsageCurrentMonthSeconds = 0` on every `INITIAL_PURCHASE`/`RENEWAL`. Should the monthly renewal counter reset to 0 on every renewal, or only on the first purchase of a new period? A renewal is a new billing cycle, so reset seems correct — but confirm with product intent.

> [!NOTE]
> **Paywall UI:** The plan above uses a hand-rolled paywall for full design control. If you want to use RevenueCat's pre-built Paywall UI instead (`react-native-purchases-ui`), replace Phase 4 step 4.6 with `RevenueCatUI.presentPaywall()` — it requires less code but less design control.

---

## Verification Plan

### Automated
```bash
# After Phase 1
cd apps/backend-api && pnpm build && pnpm lint

# After Phase 2
cd apps/backend-api && pnpm test

# After Phase 4
cd apps/mobile-app && pnpm lint && pnpm tsc --noEmit
```

### Manual / Integration
1. Deploy backend to staging with the new migration applied.
2. Configure RevenueCat webhook to point at the staging URL.
3. Use RevenueCat **Send Test Event** to fire an `INITIAL_PURCHASE` → confirm `WebhookEvent` row created, `Subscription` upgraded, `User.currentSubscriptionId` updated.
4. Send the exact same event ID again → confirm the webhook returns `200 OK` and the DB has exactly **one** `WebhookEvent` row (idempotency).
5. On mobile (development build with sandbox credentials) → open paywall → purchase → confirm `CustomerInfo.entitlements.active` contains `pro`.
6. Confirm `User.quotaUsageCurrentMonthSeconds` resets to 0 after upgrade.
