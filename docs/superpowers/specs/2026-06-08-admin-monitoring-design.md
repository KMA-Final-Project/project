# Admin Monitoring + Dashboard Resilience — Design Spec

**Date:** 2026-06-08
**Status:** Approved for implementation
**Scope:** Backend monitoring endpoints, dashboard monitoring pages, auth resilience, toast support

---

## 1. Problem Statement

The admin dashboard has placeholder monitoring pages with no data layer. When access tokens expire, the dashboard throws errors instead of silently refreshing. There is no global toast system for operator feedback.

## 2. Goals

- Real queue monitoring with auto-refresh
- Real failure diagnostics with server-side filtering and URL-persisted state
- Silent single-flight token refresh for the dashboard
- Global toast support (sonner)
- Read-only monitoring — no mutation operations

## 3. Non-Goals

- Role management UI
- Queue retry/pause/clear controls
- Schema changes for richer media failure metadata
- Broad dashboard refactors outside auth + monitoring
- Mixed interleaved timeline (hybrid = shared summary + source tabs, not one merged table)

---

## 4. Architecture

### 4.1 Backend

New `MonitoringAdminService` under the existing `admin` module. Wired into `AdminController`. Two new GET endpoints.

**GET /admin/monitoring/queues**
- Reuses BullMQ access through existing `QueueModule`
- Returns raw per-queue counts + `generatedAt`
- Shape:
  ```
  { generatedAt: string, queues: Array<{ name, waiting, active, delayed, completed, failed, paused }> }
  ```

**GET /admin/monitoring/failures**
- Source-scoped dataset (not one mixed timeline)
- `source=MEDIA`: query `media_items` WHERE `status=FAILED` AND `deletedAt=null`, join user email, filter in SQL by search/from/to/originType/failCode, sort newest first
- `source=QUEUE`: enumerate retained BullMQ failed jobs from `transcription` and `ai-processing` queues via `queue.getFailed()`, map payload fields (mediaId, userId, type), filter/sort in memory, then paginate
- Always returns `summary.failedMediaCount` (DB) and `summary.failedQueueJobCount` (BullMQ) regardless of active source tab
- Response shape:
  ```
  {
    source, summary: { failedMediaCount, failedQueueJobCount, availableFailCodes },
    data: AdminMonitoringFailureItem[],
    total, page, limit
  }
  ```

**No Prisma migration.** No queue name inference for failed media rows.

### 4.2 Contracts

Add shared admin monitoring transport types to `packages/contracts` in a new `admin-monitoring.ts` file. Export from package index.

Types to add:
- `AdminMonitoringQueueOverview` (response shape for queues endpoint)
- `AdminMonitoringFailuresQuery` (query params for failures endpoint)
- `AdminMonitoringFailureSource` (union: "MEDIA" | "QUEUE")
- `AdminMonitoringFailureItem` (flattened admin row with nullable source-specific fields)
- `AdminMonitoringFailuresResponse` (response shape for failures endpoint)

### 4.3 Dashboard

#### 4.3.1 Feature Structure

Follow existing feature-folder pattern:
```
features/monitoring/
  monitoring-api.ts        — API functions
  monitoring-queries.ts    — TanStack Query factories
  types.ts                 — Re-export from @kapter/contracts
  pages/
    monitoring-queues-page.tsx
    monitoring-failures-page.tsx
```

#### 4.3.2 Queues Page Design

- Page header: "Queue monitoring" signal-text, last-updated timestamp, manual refresh button, auto-refresh indicator
- 2-column grid (transcription + ai-processing), each in a Card with:
  - Queue name heading + health badge (stable/watch/critical)
  - 6-metric grid: waiting, active, delayed, completed, failed, paused
  - Each metric in `rounded-2xl border-border/70` sub-card
- 15-second auto-refresh via `refetchInterval`
- Loading/error/empty states matching existing patterns

#### 4.3.3 Failures Page Design

- **Summary cards row**: 2 cards — "Failed Media" count, "Failed Queue Jobs" count (always both visible)
- **Source tabs**: shadcn `Tabs` — "Media" and "Queue"
- **Filter bar**:
  - `Input` for search (debounced 300ms)
  - `Select` for originType (MEDIA: LOCAL/YOUTUBE)
  - `Select` for failCode (MEDIA: from `availableFailCodes`)
  - `Select` for queueName (QUEUE: transcription/ai-processing)
  - `Input[type=date]` for from/to range
  - All filters in URL via `useSearchParams`
  - Any filter change resets `page=1`
  - Switching source clears incompatible filters (originType/failCode when leaving MEDIA, queueName when leaving QUEUE)
- **Data table**: shadcn `Table`
  - Media columns: occurredAt, mediaTitle, mediaId, userEmail, originType, failCode, failReason
  - Queue columns: occurredAt, queueName, jobId, attemptsMade, failReason
- **Pagination**: server-side prev/page-numbers/next
- 15-second auto-refresh + manual refresh

#### 4.3.4 Sonner Toast Integration

- Install `sonner`
- Mount `<Toaster />` in provider tree (after `AuthProvider`)
- Toast scope: terminal auth/session expiry, explicit user-triggered refresh failures
- Keep inline login form errors and existing page error panels

### 4.4 Auth Resilience

#### 4.4.1 authStorage Extension

Add to `auth-storage.ts`:
- `updateTokens(tokens)`: merge new tokens into existing session, persist
- `subscribe(callback)`: listen for storage changes (same-tab via `CustomEvent`, cross-tab via `storage` event)

#### 4.4.2 AuthProvider Update

Listen for auth storage changes. When tokens are rotated or cleared, sync local session state.

#### 4.4.3 apiClient Single-Flight Refresh

In `apiClient.request()`:
- If 401 response AND path is not `/auth/login` or `/auth/refresh`:
  - Check if another refresh is in-flight (shared `Promise | null`)
  - If not, call `POST /auth/refresh` with stored `refreshToken`
  - On success: persist via `authStorage.updateTokens()`, replay original request once
  - On failure: clear session, emit one session-expired toast, let `RequireAdmin` redirect to `/login`
- Skip refresh for `/auth/login` and `/auth/refresh`

---

## 5. Visual Design Guidelines

Match existing dashboard aesthetic:
- Dark-mode-first with `panel-glow`, `signal-text` tokens
- `rounded-3xl` for cards, `rounded-2xl` for sub-elements
- `border-border/70 bg-background/72` card styling
- `font-heading text-3xl` for values, `signal-text` for labels
- Remix icons (`@remixicon/react`) for all icons
- `destructive` tone for failure/error states
- No emojis — SVG icons only
- `cursor-pointer` on all clickable elements
- Hover transitions 150-300ms

---

## 6. Data Flow

```
Dashboard                    Backend API                  BullMQ / DB
   |                             |                            |
   |-- GET /admin/monitoring/queues -->|                        |
   |                             |-- getJobCounts() --------->|
   |                             |<-- counts -----------------|
   |<-- { generatedAt, queues } -|                            |
   |                             |                            |
   |-- GET /admin/monitoring/failures?source=MEDIA ---------->|
   |                             |-- Prisma query ----------->|
   |                             |<-- media items ------------|
   |<-- { summary, data, total }|                            |
   |                             |                            |
   |-- GET /admin/monitoring/failures?source=QUEUE ---------->|
   |                             |-- getFailed() per queue -->|
   |                             |<-- failed jobs ------------|
   |<-- { summary, data, total }|                            |
```

---

## 7. Error Handling

- **Backend**: Standard NestJS exception handling. Invalid source param → 400. Unauthorized → 401.
- **Dashboard**: TanStack Query error states with retry=1. Destructive-styled error cards with retry button.
- **Auth**: 401 → attempt refresh → success: replay, failure: clear + toast + redirect
- **Toast**: One session-expired toast per expiry event (deduplicated)

---

## 8. Testing Strategy

### Backend
- Unit tests for `MonitoringAdminService`
- Queue overview: returns both queues and generatedAt
- Media failures: search, date range, originType, failCode, pagination
- Queue failures: queueName, search, date filtering, pagination
- Summary: returns both media and queue counts regardless of active source

### Dashboard
- `pnpm typecheck` — zero errors
- `pnpm lint` — zero errors
- `pnpm build` — successful

### Manual Acceptance
- Queues page: auto-refresh every 15s, manual refresh works
- Failures page: filters persist in URL, survive reload
- Source switch: removes incompatible filters, resets pagination
- Expired access + valid refresh: silent recovery, replay once
- Invalid refresh: clear session, one toast, redirect to login
