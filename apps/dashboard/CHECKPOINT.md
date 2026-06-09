# Dashboard CHECKPOINT

## Module: `apps/dashboard`

Stack: Vite 7, React 19, React Router 7, TanStack Query 5, shadcn/ui, Tailwind CSS v4

---

## Status as of 2026-06-08

### Working ✅

| Area | Detail |
|------|--------|
| Auth flow | Login → JWT stored in localStorage → `AuthContext` provides user + `isAdmin` |
| HTTP client | `ApiClient` with `get`, `post`, `patch`, `delete`. Attaches `Authorization: Bearer`. Single-flight 401 refresh. |
| Overview page (`/`) | Fetches `GET /admin/overview` and renders metrics cards |
| Plans page (`/plans`) — INVENTORY | Summary metrics, plan cards link to `/plans/:id`, "New plan" button |
| Plan detail (`/plans/:id`) | Header, summary cards (variants, active subscribers, historical), plan actions, variant cards with per-variant metrics, subscriber links |
| Users page (`/users`) | Server-side filters (search, role, planId, variantId) via URL params, role change button per row |
| Users detail (`/users/:id`) | Profile, subscription, quota, role management card, role change with confirmation |
| Queues page (`/monitoring/queues`) | Real-time queue health, 15s auto-refresh, health badges |
| Failures page (`/monitoring/failures`) | Source-tabs, URL-backed filters, server-side pagination, summary cards |
| Auth resilience | Single-flight token refresh on 401, session-expired toast |
| Toast notifications | sonner `<Toaster />` mounted in provider tree |
| Router | `/overview`, `/users`, `/users/:id`, `/plans`, `/plans/:id`, `/ai-explain`, `/monitoring/queues`, `/monitoring/failures`, 404 |
| Route guard | `RequireAdmin` wraps all admin routes; `AuthGuard` on login redirect |

### Scaffold / Incomplete ⚠️

| Area | Detail |
|------|--------|
| Kapter Explain admin monitoring | Metrics/session page wired to backend admin endpoints |

### Scaffold / Incomplete ⚠️

| Area | Detail |
|------|--------|
| Kapter Explain admin monitoring | Metrics/session page wired to backend admin endpoints |

---

## Known Gaps / Follow-up

| ID | Issue | Priority |
|----|-------|----------|
| F-06 | Manual visual verification of Kapter Explain admin page with real usage data | Medium |
| F-05 | `_count.subscriptions` not present on list-level plan data — requires `GET /admin/plans/:id` fetch per variant edit | Low |

---

## Recent Update — 2026-06-08

- 2026-06-08 — Plan detail page + role management. Status: Working.
  - New `/plans/:id` detail page with plan metadata, summary cards (variants, active subscribers, historical subscriptions), variant cards with per-variant metrics, plan/variant actions, subscriber links to `/users?planId=...` and `/users?variantId=...`.
  - Plans list simplified to inventory-only: cards link to detail, inline edit/deactivate/add-variant controls removed.
  - Users page now uses server-side filters (search, role, planId, variantId) via URL-backed `useSearchParams`.
  - Deep-link support: plan detail subscriber links populate users page filters.
  - Role management: row-level promote/demote on users list, role management card on user detail page, `RoleChangeDialog` with confirmation.
  - Self-demotion disabled client-side, backend rejects self-demotion and last-admin demotion with toast feedback.
  - `PATCH /admin/users/:id/role` wired with mutation, query invalidation, and toast.
  - Resolved gap F-03 (plan detail drawer) — now a full page instead of a drawer.
  - Contract touchpoints: API (plan detail, user filters, role management).
  - Validation: `pnpm typecheck`; `pnpm lint`; `pnpm build`.

- 2026-06-08 — Admin monitoring pages + auth resilience + sonner toasts. Status: Working.
  - Queues page: real-time queue health from `GET /admin/monitoring/queues`, 15s auto-refresh, health badges (stable/watch/critical), per-queue metric grids.
  - Failures page: source-tabs (Media/Queue), URL-backed filters via `useSearchParams`, server-side pagination, summary cards for failed media and queue jobs.
  - Auth resilience: single-flight token refresh in `apiClient` — on 401, attempts one shared `POST /auth/refresh`, replays on success, clears session on failure.
  - `authStorage` extended with `updateTokens()` and `subscribe()` (same-tab `CustomEvent` propagation).
  - `AuthProvider` listens for storage changes and syncs session state.
  - sonner `<Toaster />` mounted in provider tree with dark theme, bottom-right position.
  - Shared monitoring contract types added to `packages/contracts/src/admin-monitoring.ts`.
  - Monitoring feature layer: `monitoring-api.ts`, `monitoring-queries.ts`, `types.ts`.
  - Contract touchpoints: API (new admin monitoring endpoints), Auth (token refresh behavior).
  - Validation: `pnpm typecheck`; `pnpm lint`; `pnpm build`.
  - Resolved gaps: F-01 (JWT refresh), F-02 (monitoring data layer), F-04 (toast provider).

- 2026-06-07 — Root pnpm workspace adoption and shared TypeScript contracts. Status: Working.
- Added the repository-root `pnpm` workspace and moved dashboard package management onto the shared root lockfile.
- Replaced dashboard-local auth/overview/plans/users/ai-explain transport types with imports from `packages/contracts`, which now emits ESM plus declaration files through `tsup`.
- Added root workspace scripts so dashboard build/lint/typecheck can run from the repository root.
- Why: the dashboard was duplicating backend-owned admin contract shapes, and the project now needs a stable shared TS boundary before a future user-facing web app is added.
- Contract touchpoints: TypeScript compile-time authority only. Dashboard API behavior unchanged.
- Validation: `pnpm typecheck`; `pnpm lint`; `pnpm build`.
- Follow-up: if shared admin response DTOs become fully explicit in the backend later, keep the workspace package boundary and switch the internals rather than creating a second contract source.

- Kapter Explain Phase 1 dashboard types. Status: In-Progress.
- Added admin metrics/session response types for future Kapter Explain monitoring.
- Added `aiCreditsPerMonth` to plan variant create/update/list types so dashboard contracts match backend plan quota fields.
- Contract touchpoints: API, Quota.
- Validation: `pnpm typecheck` passed.

- Kapter Explain admin observability page. Status: Partial.
- Added AI Explain dashboard API wrappers, TanStack Query options, `/ai-explain` route, sidebar navigation entry, metrics cards, daily usage bars, top-segments table, and recent-session table.
- Updated plan variant form to create/update `aiCreditsPerMonth`, keeping the dashboard aligned with the backend plan DTO contract.
- Contract touchpoints: API, Quota.
- Validation: `pnpm typecheck`; `pnpm lint`; `pnpm build`.
- Follow-up: manually verify visual data with a running backend after real Explain usage logs exist.

---

## Component Inventory

| Component | Path | Status |
|-----------|------|--------|
| `ConfirmDialog` | `features/plans/components/confirm-dialog.tsx` | ✅ Working |
| `PlanFormDialog` | `features/plans/components/plan-form-dialog.tsx` | ✅ Working |
| `VariantFormDialog` | `features/plans/components/variant-form-dialog.tsx` | ✅ Working (with versioning warning) |
| `PlansPage` | `features/plans/pages/plans-page.tsx` | ✅ Full CRUD |
| `UsersPage` | `features/users/pages/users-page.tsx` | ✅ Working |
| `UserDetailPage` | `features/users/pages/user-detail-page.tsx` | ✅ Working |

---

## shadcn Components Installed

`button`, `card`, `input`, `dialog`, `select`, `label`, `badge`, `textarea`, `separator`

---

## Validation Results — 2026-06-08

```
Contracts build:     PASSED
Backend build:       PASSED
Backend lint:        PASSED
Backend test:        PASSED (44/44 tests, 9 new)
Dashboard tsc:       PASSED
Dashboard lint:      PASSED
Dashboard build:     PASSED
```
