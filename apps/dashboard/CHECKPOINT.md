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
| Plans page (`/plans`) — READ | Fetches all plans, variant rows, quota info |
| Plans page — CREATE | `PlanFormDialog` wired to `POST /admin/plans` |
| Plans page — EDIT plan | `PlanFormDialog` wired to `PATCH /admin/plans/:id` |
| Plans page — DEACTIVATE plan | `ConfirmDialog` wired to `DELETE /admin/plans/:id` |
| Plans page — ADD variant | `VariantFormDialog` wired to `POST /admin/plans/:planId/variants` |
| Plans page — EDIT variant | `VariantFormDialog` wired to `PATCH /admin/variants/:id` with versioning warning when `_count.subscriptions > 0` |
| Plans page — DELETE variant | `ConfirmDialog` wired to `DELETE /admin/variants/:id` |
| Users page (`/users`) | Paginated list from `GET /admin/users`, client-side search + role filter |
| Users detail (`/users/:id`) | Profile, subscription snapshot, quota bar, recent billing history |
| Queues page (`/monitoring/queues`) | Real-time queue health from `GET /admin/monitoring/queues`, 15s auto-refresh, health badges |
| Failures page (`/monitoring/failures`) | Source-tabs (Media/Queue), URL-backed filters, server-side pagination, summary cards |
| Auth resilience | Single-flight token refresh on 401, session-expired toast, silent recovery |
| Toast notifications | sonner `<Toaster />` mounted in provider tree |
| Router | `/`, `/login`, `/users`, `/users/:id`, `/plans`, `/ai-explain`, `/monitoring/queues`, `/monitoring/failures`, 404 |
| Route guard | `RequireAdmin` wraps all admin routes; `AuthGuard` on login redirect |

### Scaffold / Incomplete ⚠️

| Area | Detail |
|------|--------|
| Kapter Explain admin monitoring | Metrics/session page wired to backend admin endpoints |

---

## Known Gaps / Follow-up

| ID | Issue | Priority |
|----|-------|----------|
| F-06 | Manual visual verification of Kapter Explain admin page with real usage data | Medium |
| F-03 | Plan slide-over drawer for detail view (currently only list + edit dialog) | Low |
| F-05 | `_count.subscriptions` not present on list-level plan data — requires `GET /admin/plans/:id` fetch per variant edit | Low |

---

## Recent Update — 2026-06-08

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
Backend build:     PASSED (pnpm build — zero errors)
Backend lint:      PASSED (pnpm lint — zero errors)
Backend test:      PASSED (pnpm test — 6/6 monitoring tests pass)
Dashboard tsc:     PASSED (pnpm typecheck — zero errors)
Dashboard eslint:  PASSED (pnpm lint — zero errors)
Dashboard build:   PASSED (pnpm build — zero errors)
```
