# Dashboard CHECKPOINT

## Module: `apps/dashboard`

Stack: Vite 7, React 19, React Router 7, TanStack Query 5, shadcn/ui, Tailwind CSS v4

---

## Status as of 2026-05-24

### Working ✅

| Area | Detail |
|------|--------|
| Auth flow | Login → JWT stored in localStorage → `AuthContext` provides user + `isAdmin` |
| HTTP client | `ApiClient` with `get`, `post`, `patch`, `delete`. Attaches `Authorization: Bearer`. |
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
| Router | `/`, `/login`, `/users`, `/users/:id`, `/plans`, `/monitoring`, 404 |
| Route guard | `RequireAdmin` wraps all admin routes; `AuthGuard` on login redirect |

### Scaffold / Incomplete ⚠️

| Area | Detail |
|------|--------|
| Monitoring page (`/monitoring`) | Placeholder only — no data layer |
| Kapter Explain admin monitoring | Metrics/session page wired to backend admin endpoints |
| Toast notifications | No global toast provider; errors shown inline only |

---

## Known Gaps / Follow-up

| ID | Issue | Priority |
|----|-------|----------|
| F-01 | JWT refresh interceptor — 401 is not retried after token expiry | Medium |
| F-02 | `Monitoring` page data layer and UI | Low |
| F-06 | Manual visual verification of Kapter Explain admin page with real usage data | Medium |
| F-03 | Plan slide-over drawer for detail view (currently only list + edit dialog) | Low |
| F-04 | Global toast/sonner provider for success/error notifications | Low |
| F-05 | `_count.subscriptions` not present on list-level plan data — requires `GET /admin/plans/:id` fetch per variant edit | Low |

---

## Recent Update — 2026-05-24

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

## Validation Results — 2026-05-21

```
Backend build:     PASSED (pnpm build — zero errors)
Dashboard tsc:     PASSED (pnpm typecheck — zero errors)
Dashboard eslint:  PASSED (pnpm lint — zero errors)
2026-05-24:        PASSED (pnpm typecheck — zero errors)
2026-05-24:        PASSED (pnpm lint; pnpm build)
```
