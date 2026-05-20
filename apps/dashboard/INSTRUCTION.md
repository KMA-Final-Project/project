# Dashboard - Instruction

> Module: `apps/dashboard`
> Stack: React 19, Vite 7, React Router 7, TanStack Query 5, shadcn/ui (Radix), Tailwind CSS v4, Zod v4, React Hook Form 7, TypeScript 5.9

## 1. Module Role

The dashboard is the **admin-only web control plane** for the Kapter bilingual subtitle SaaS platform.

It is not user-facing. It is an operator tool accessed only by accounts with `role === "ADMIN"`.

It does **not** handle audio, video, subtitle rendering, or any AI-pipeline concerns — those belong to the AI Engine and mobile app.

Responsibilities:

- Admin authentication (JWT, ADMIN-role gating in both the API call and the React guard)
- Subscription plan and variant CRUD with versioning awareness
- User administration: paginated list, profile detail, subscription snapshot, usage history
- Platform health overview: user counts, media stats, and queue state
- BullMQ queue monitoring: queue depth, active jobs, failures
- All data is fetched live from the backend admin API; no static mocks

## 2. Architecture

```text
apps/dashboard/
  src/
    app/
      guards/        # RequireAdmin (session check), RequireAnonymous (redirect if logged in)
      layouts/       # AdminLayout (sidebar nav + main shell), AuthLayout (centered card)
      providers.tsx  # QueryClientProvider + AuthProvider composition root
      router.tsx     # createBrowserRouter route tree
    features/
      auth/          # auth-api.ts, auth-provider.tsx, auth-storage.ts, types.ts, pages/
      overview/      # overview-api.ts, overview-queries.ts, types.ts, pages/
      plans/         # plans-api.ts, plans-queries.ts, types.ts, pages/
      users/         # users-api.ts, users-queries.ts, types.ts, pages/
      monitoring/    # monitoring-api.ts, monitoring-queries.ts, types.ts, pages/
    shared/
      lib/
        http-client.ts   # fetch wrapper, ApiError class, Bearer token injection
        query-client.ts  # TanStack QueryClient singleton
      ui/                # Shared UI: RootRedirect, NotFoundPage
    components/
      ui/            # shadcn/ui generated components (button, card, dialog, etc.)
      theme-provider.tsx
    lib/
      utils.ts       # cn() class-name helper
    index.css        # Design tokens + global styles (Tailwind CSS v4 theme)
    main.tsx         # React root
    App.tsx          # AppRouter entry
```

## 3. Routing

All protected routes sit under `RequireAdmin` → `AdminLayout`. Any route under `RequireAnonymous` redirects an authenticated admin away.

```text
/            → RootRedirect → /overview (if authenticated) or /login
/login       → LoginPage
/overview    → OverviewPage      (live metrics from GET /admin/overview)
/users       → UsersPage         (paginated user list from GET /admin/users)
/users/:id   → UserDetailPage    (profile + subscription + usage from GET /admin/users/:id)
/plans       → PlansPage         (live plan inventory from GET /admin/plans)
/monitoring/queues    → MonitoringQueuesPage
/monitoring/failures  → MonitoringFailuresPage
```

## 4. Data Fetching

- All API calls use the `apiClient` singleton in `shared/lib/http-client.ts`.
- `apiClient` reads the access token from `authStorage` and injects `Authorization: Bearer <token>` on every request.
- Every feature exposes a `<feature>-api.ts` (raw fetch functions) and a `<feature>-queries.ts` (TanStack `queryOptions` factories).
- Use `queryOptions` + `useQuery` for reads. Use `useMutation` + `queryClient.invalidateQueries` for mutations.
- No polling or socket connections are used by the dashboard.

### Key query key namespaces

```ts
["overview"]               // OverviewPage
["plans"]                  // PlansPage list
["plans", id]              // Plan detail (future)
["users"]                  // UsersPage list + filters
["users", id]              // UserDetailPage
```

## 5. Authentication Flow

1. `LoginPage` calls `loginRequest()` which POSTs to `POST /auth/login`.
2. If the user's `role !== "ADMIN"`, the client throws an `ApiError(403)` before saving the session — non-admin accounts are rejected at the dashboard level.
3. The session (tokens + user) is stored in `sessionStorage` via `authStorage`.
4. `RequireAdmin` reads `authStorage` and redirects to `/login` if no valid session exists.
5. `logout()` from `useAuth()` clears `authStorage` and navigates to `/login`.
6. Token refresh is **not** implemented in the dashboard MVP. When the access token expires, the next failed request will produce an `ApiError(401)` and the admin must log in again.

## 6. Design System

The dashboard uses Tailwind CSS v4 with a custom dark-mode-first design system declared in `src/index.css`.

Key conventions:

- Typography: Figtree Variable (heading) + Geist Mono Variable (mono/signal text)
- Design tokens: `--color-*`, `--sidebar-*`, `--accent-*` CSS custom properties
- Utility classes: `panel-glow` (subtle box-shadow glow), `signal-text` (mono uppercase tracking)
- Components: shadcn/ui Radix primitives with Tailwind CSS v4 class variants (CVA)
- Avoid inline styles; use the established token classes or extend `index.css`

## 7. State Management Rules

- No global state store (Zustand, Redux, etc.). Auth state lives in `AuthContext` (`auth-provider.tsx`).
- Server state exclusively via TanStack Query. Do not lift server data into React context.
- Form state via React Hook Form + Zod validation.
- URL state (pagination, filters) via React Router search params where applicable.

## 8. Feature Conventions

Each feature folder follows this structure:

```text
features/<name>/
  <name>-api.ts       # raw API functions (always typed returns)
  <name>-queries.ts   # queryOptions factories (reads) + mutation helpers (writes)
  types.ts            # DTO/response types mirroring backend shapes
  pages/
    <name>-page.tsx   # top-level route component
    <name>-detail-page.tsx   # optional detail route
  components/         # optional sub-components scoped to this feature
```

Type definitions in `types.ts` must stay aligned with backend DTO response shapes. The dashboard is a consumer, not an authority — the canonical types live in the backend DTOs.

## 9. Backend API Contract Surface

The dashboard exclusively calls `GET /admin/*`, `POST /admin/*`, `PATCH /admin/*`, and `DELETE /admin/*` endpoints. All routes require an `Authorization: Bearer <access-token>` header and `role === ADMIN`.

Current stable endpoints used by the dashboard:

| Method | Path | Dashboard usage |
|--------|------|-----------------|
| `GET` | `/admin/overview` | OverviewPage metrics |
| `GET` | `/admin/plans` | PlansPage list |
| `GET` | `/admin/plans/:id` | Plan detail (planned) |
| `POST` | `/admin/plans` | Create plan |
| `PATCH` | `/admin/plans/:id` | Update plan |
| `DELETE` | `/admin/plans/:id` | Deactivate plan |
| `POST` | `/admin/plans/:planId/variants` | Create variant |
| `PATCH` | `/admin/variants/:id` | Update variant |
| `DELETE` | `/admin/variants/:id` | Delete/deactivate variant |
| `GET` | `/admin/users` | UsersPage list (missing — needs backend) |
| `GET` | `/admin/users/:id` | User detail page (missing — needs backend) |
| `PATCH` | `/admin/users/:id/role` | Change user role (missing — needs backend) |

## 10. Rules for Agents

- Do not add polling or WebSocket connections; all data is request/response.
- Do not use Redux, Zustand, or any global store beyond `AuthContext`.
- Do not add backend endpoints not in `CONTRACTS.md` without a contract update.
- Match the visual style of existing pages: `panel-glow`, `border-border/70`, `bg-background/72`, `signal-text`.
- All new pages go under `features/<name>/pages/`.
- All API functions must be typed; no `any` in API responses.
- Use `useMutation` + `invalidateQueries` for all write operations; no manual refetch patterns.
- Dialog open/close state lives in a local `useState`, not in TanStack Query or route state.
- Run `pnpm typecheck` and `pnpm lint` after any change.
