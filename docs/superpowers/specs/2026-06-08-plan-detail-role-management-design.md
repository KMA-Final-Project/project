# Control-Plane Bundle: Plan Detail + Role Management — Design Spec

**Date:** 2026-06-08
**Status:** Approved for implementation
**Scope:** Plan detail page, plan list simplification, server-side user filters, role management

---

## 1. Problem Statement

The `/plans` page currently serves as both inventory and action surface — edit, deactivate, and add-variant controls are inline on list cards. There is no dedicated plan detail view. The subscription-count ambiguity (`_count.subscriptions` conflates active current subscribers with historical records) makes mutation safety unclear. Users have no role management UI, and the users list has only client-side filtering.

## 2. Goals

- Dedicated `/plans/:id` detail surface for plan/variant management
- Clear distinction between active current subscribers and historical subscriptions
- Server-side user filtering with deep-link support from plan detail
- Role management (USER/ADMIN) from both user list and user detail
- Plan list reduced to inventory + create entry

## 3. Non-Goals

- Audit log for role changes
- Bulk role changes
- Navigable historical subscription user tables (counts only)
- Separate history timeline
- Changes to the existing plan/variant mutation contracts

---

## 4. Architecture

### 4.1 Backend

**Enhanced GET /admin/plans/:id** — returns `AdminPlanDetail`:
- Plan metadata (unchanged)
- Summary totals: `totalVariants`, `activeVariants`, `activeCurrentSubscribers`, `historicalSubscriptions`
- Variant rows each with `subscriptionMetrics: { activeCurrentSubscribers, historicalSubscriptions }`

Count semantics:
- `activeCurrentSubscribers` = count of `User` where `currentSubscription.variantId = variant.id`
- `historicalSubscriptions` = count of `Subscription` where `variantId = variant.id`

**Extended GET /admin/users** — new optional query params:
- `search`: free-text across `fullName` and `email` (case-insensitive `contains`)
- `role`: filter by `USER` or `ADMIN`
- `planId`: filter users where `currentSubscription.variant.planId = planId`
- `variantId`: filter users where `currentSubscription.variantId = variantId`

**New PATCH /admin/users/:id/role**:
- Request: `{ role: "USER" | "ADMIN" }`
- Response: `{ id, role, updatedAt }`
- Backend enforcement:
  - Block self-demotion (compare `req.user.id` with target `id`)
  - Block demoting the last remaining admin

### 4.2 Contracts

Add to `packages/contracts`:

```ts
// admin-plans.ts additions
interface AdminPlanSubscriptionMetrics {
  activeCurrentSubscribers: number;
  historicalSubscriptions: number;
}

interface AdminPlanVariantDetail extends PlanVariant {
  subscriptionMetrics: AdminPlanSubscriptionMetrics;
}

interface AdminPlanDetail {
  id: string;
  code: string;
  name: string;
  description: string | null;
  features: string[] | null;
  tierLevel: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  totalVariants: number;
  activeVariants: number;
  activeCurrentSubscribers: number;
  historicalSubscriptions: number;
  variants: AdminPlanVariantDetail[];
}

// admin-users.ts additions
interface UpdateAdminUserRolePayload {
  role: UserRole;
}

interface AdminUserRoleUpdateResult {
  id: string;
  role: UserRole;
  updatedAt: string;
}

// Extend existing AdminUsersQueryParams
interface AdminUsersQueryParams {
  page?: number;
  limit?: number;
  search?: string;      // NEW
  role?: UserRole;      // NEW
  planId?: string;      // NEW
  variantId?: string;   // NEW
}
```

### 4.3 Dashboard

**Router**: Add `/plans/:id` route under `RequireAdmin` > `AdminLayout`.

**`/plans` page simplification**:
- Plan cards become simpler: name, tier, code, status badge, variant count, description
- Remove edit/deactivate/add-variant controls from cards
- Each card is a clickable link to `/plans/:id`
- Keep "New plan" button and summary metrics at top

**`/plans/:id` page**:
- Breadcrumb back to `/plans`
- Header: name, code, tier, status badge, description, features chips
- Summary cards (4-up): total variants, active variants, active current subscribers, historical subscriptions
- Plan actions row: Edit plan dialog, Deactivate plan dialog
- Variants section: each variant in a card with price, billing cycle, quotas, AI credits, active count, historical count, status
- Variant actions per card: edit, deactivate/delete
- Plan-level "View subscribers" link → `/users?planId=...`
- Variant-level "View subscribers" link → `/users?variantId=...`
- Inactive variants shown with muted styling

**`/users` page changes**:
- Move search and role filters to URL-backed `useSearchParams`
- Support `?planId=...` and `?variantId=...` deep links from plan detail
- Add row-level role change button with confirmation dialog
- Disable self-demotion in the UI
- Show backend last-admin rejections via toast

**`/users/:id` page changes**:
- Add "Role management" card after profile card
- Shows current role with change button
- Confirmation dialog for role changes
- Invalidate both list and detail queries after success

---

## 5. Variant Mutation Behavior (Clarified)

Current behavior (unchanged in contract, clarified in semantics):
- **hasSubscribers** = active current subscribers > 0 (not total historical)
- Metadata-only edits (name, isActive) → update in place regardless of subscribers
- Term changes (price, maxDurationPerFile, monthlyQuotaSeconds, aiCreditsPerMonth) when active current subscribers > 0 → create new version, deactivate old
- Term changes when no active current subscribers → update in place
- Delete when both active = 0 AND historical = 0 → hard delete
- Delete when historical > 0 → deactivate (preserve referential history)
- Plan deactivation blocked when any active current subscribers exist across its variants

---

## 6. Data Flow

```
Dashboard /plans/:id         Backend GET /admin/plans/:id       Prisma
      |                              |                            |
      |-- GET /admin/plans/:id ----->|                            |
      |                              |-- findUnique(planId) ----->|
      |                              |   include variants         |
      |                              |<- plan + variants ---------|
      |                              |                            |
      |                              |-- for each variant:        |
      |                              |   count Users where        |
      |                              |   currentSubscription.     |
      |                              |   variantId = v.id ------->|
      |                              |<- activeCurrentSubs -------|
      |                              |                            |
      |                              |   count Subscriptions      |
      |                              |   where variantId = v.id ->|
      |                              |<- historicalSubs ----------|
      |<-- AdminPlanDetail ----------|                            |


Dashboard /users?planId=X    Backend GET /admin/users?planId=X   Prisma
      |                              |                            |
      |-- GET /admin/users --------->|                            |
      |   ?planId=X&search=Y&role=Z |                            |
      |                              |-- findMany where:          |
      |                              |   currentSubscription.     |
      |                              |   variant.planId = X       |
      |                              |   AND (fullName/email      |
      |                              |   contains search)         |
      |                              |   AND role = Z ----------->|
      |<-- AdminUserListResponse ----|                            |
```

---

## 7. Error Handling

- **Plan detail**: 404 if plan ID not found (standard NestJS NotFoundException)
- **Role change — self-demotion**: Backend returns 400 with message "Cannot change your own role." Toast shown in dashboard.
- **Role change — last admin**: Backend returns 400 with message "Cannot demote the last remaining admin." Toast shown in dashboard.
- **Role change — invalid role**: Backend validation rejects values other than USER/ADMIN
- **Plan deactivation with active subscribers**: Backend returns 400 (existing behavior)

---

## 8. Testing Strategy

### Backend
- GET /admin/plans/:id returns correct metrics (active current vs historical)
- GET /admin/users filters by search, role, planId, variantId
- PATCH /admin/users/:id/role allows normal promotion/demotion
- PATCH /admin/users/:id/role rejects self-demotion
- PATCH /admin/users/:id/role rejects demoting last admin
- Variant term changes version only when active current subscribers exist
- Variant deletion hard-deletes only with zero history and zero active current

### Dashboard
- `pnpm typecheck` — zero errors
- `pnpm lint` — zero errors
- `pnpm build` — successful

### Manual Acceptance
- Editing quota/price/AI credits on a live-subscribed variant creates replacement
- Editing same fields on variant with no active current subscribers updates in place
- Historical-only variants remain visible and non-hard-deletable
- Plan subscriber links land on correct user slice
- Role changes work from both list and detail with confirmation
- Self-demotion disabled client-side and backend rejection shown cleanly
