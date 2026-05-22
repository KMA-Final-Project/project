# Dashboard CHECKPOINT

## Module: `apps/dashboard`

Stack: Vite 7, React 19, React Router 7, TanStack Query 5, shadcn/ui, Tailwind CSS v4

---

## Status as of 2026-05-21

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
| Toast notifications | No global toast provider; errors shown inline only |

---

## Known Gaps / Follow-up

| ID | Issue | Priority |
|----|-------|----------|
| F-01 | JWT refresh interceptor — 401 is not retried after token expiry | Medium |
| F-02 | `Monitoring` page data layer and UI | Low |
| F-03 | Plan slide-over drawer for detail view (currently only list + edit dialog) | Low |
| F-04 | Global toast/sonner provider for success/error notifications | Low |
| F-05 | `_count.subscriptions` not present on list-level plan data — requires `GET /admin/plans/:id` fetch per variant edit | Low |

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
```
