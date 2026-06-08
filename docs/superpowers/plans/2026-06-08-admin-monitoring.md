# Admin Monitoring + Dashboard Resilience Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task.

**Goal:** Build real admin monitoring (queues + failures) and dashboard auth resilience (single-flight token refresh + sonner toasts).

**Tech Stack:** NestJS, Prisma, BullMQ, React 19, TanStack Query 5, React Router 7, shadcn/ui, Tailwind CSS v4, sonner, Vite 7

---

## File Map

### Create
| Path | Purpose |
|------|---------|
| packages/contracts/src/admin-monitoring.ts | Shared monitoring transport types |
| apps/backend-api/src/modules/admin/services/monitoring-admin.service.ts | Queue overview + failure query service |
| apps/backend-api/src/modules/admin/services/monitoring-admin.service.spec.ts | Unit tests |
| apps/backend-api/src/modules/admin/dto/monitoring.dto.ts | Swagger DTOs |
| apps/dashboard/src/features/monitoring/monitoring-api.ts | API functions |
| apps/dashboard/src/features/monitoring/monitoring-queries.ts | Query factories |
| apps/dashboard/src/features/monitoring/types.ts | Re-export from contracts |

### Modify
| Path | Change |
|------|--------|
| packages/contracts/src/index.ts | Export admin-monitoring |
| apps/backend-api/src/modules/admin/services/index.ts | Export MonitoringAdminService |
| apps/backend-api/src/modules/admin/dto/index.ts | Export monitoring DTOs |
| apps/backend-api/src/modules/admin/admin.module.ts | Register MonitoringAdminService |
| apps/backend-api/src/modules/admin/admin.controller.ts | Add 2 monitoring endpoints |
| apps/backend-api/src/modules/queue/queue.service.ts | Add getFailedJobs() method |
| apps/dashboard/package.json | Add sonner |
| apps/dashboard/src/features/auth/auth-storage.ts | Add updateTokens + subscribe |
| apps/dashboard/src/features/auth/auth-provider.tsx | Listen for storage changes |
| apps/dashboard/src/shared/lib/http-client.ts | Add single-flight refresh |
| apps/dashboard/src/app/providers.tsx | Mount Toaster |
| apps/dashboard/src/features/monitoring/pages/monitoring-queues-page.tsx | Replace scaffold |
| apps/dashboard/src/features/monitoring/pages/monitoring-failures-page.tsx | Replace scaffold |
| CONTRACTS.md | Add monitoring contract section |
| apps/backend-api/CHECKPOINT.md | Update |
| apps/dashboard/CHECKPOINT.md | Update |

---

## Task 1: Add monitoring contract types to packages/contracts

**Files:** Create packages/contracts/src/admin-monitoring.ts, Modify packages/contracts/src/index.ts

- [ ] Step 1: Create packages/contracts/src/admin-monitoring.ts with all monitoring types
- [ ] Step 2: Add export line to packages/contracts/src/index.ts
- [ ] Step 3: Build contracts package: pnpm --filter @kapter/contracts build

---

## Task 2: Add getFailedJobs() to QueueService

**Files:** Modify apps/backend-api/src/modules/queue/queue.service.ts

- [ ] Step 1: Add getFailedJobs method after getQueueOverview
- [ ] Step 2: Build backend: pnpm --filter backend-api build

---

## Task 3: Build MonitoringAdminService

**Files:** Create apps/backend-api/src/modules/admin/services/monitoring-admin.service.ts

- [ ] Step 1: Create MonitoringAdminService with getQueueOverview and getFailures methods
- [ ] Step 2: Export from services/index.ts

---

## Task 4: Add monitoring DTOs

**Files:** Create apps/backend-api/src/modules/admin/dto/monitoring.dto.ts, Modify dto/index.ts

- [ ] Step 1: Create monitoring.dto.ts with Swagger DTOs
- [ ] Step 2: Export from dto/index.ts

---

## Task 5: Wire monitoring endpoints

**Files:** Modify admin.controller.ts, admin.module.ts

- [ ] Step 1: Add MonitoringAdminService to AdminModule providers/exports
- [ ] Step 2: Inject MonitoringAdminService in AdminController constructor
- [ ] Step 3: Add GET /admin/monitoring/queues endpoint
- [ ] Step 4: Add GET /admin/monitoring/failures endpoint
- [ ] Step 5: Build backend: pnpm --filter backend-api build

---

## Task 6: Unit tests for MonitoringAdminService

**Files:** Create apps/backend-api/src/modules/admin/services/monitoring-admin.service.spec.ts

- [ ] Step 1: Write tests for getQueueOverview
- [ ] Step 2: Write tests for getFailures with source=MEDIA (pagination, search, filters)
- [ ] Step 3: Write tests for getFailures with source=QUEUE (filtering, pagination)
- [ ] Step 4: Run tests: pnpm --filter backend-api test

---

## Task 7: Install sonner in dashboard

- [ ] Step 1: pnpm --filter dashboard add sonner

---

## Task 8: Add dashboard monitoring feature layer

**Files:** Create monitoring/types.ts, monitoring-api.ts, monitoring-queries.ts

- [ ] Step 1: Create types.ts re-exporting from @kapter/contracts
- [ ] Step 2: Create monitoring-api.ts with getMonitoringQueues and getMonitoringFailures
- [ ] Step 3: Create monitoring-queries.ts with query factories (15s staleTime + refetchInterval)

---

## Task 9: Build queues monitoring page

**Files:** Modify apps/dashboard/src/features/monitoring/pages/monitoring-queues-page.tsx

- [ ] Step 1: Replace scaffold with real page (auto-refresh, health badges, metric grids)

---

## Task 10: Build failures monitoring page

**Files:** Modify apps/dashboard/src/features/monitoring/pages/monitoring-failures-page.tsx

- [ ] Step 1: Replace scaffold with real page (summary cards, source tabs, URL-backed filters, data table, pagination)

---

## Task 11: Implement auth resilience

**Files:** Modify auth-storage.ts, auth-provider.tsx, http-client.ts

- [ ] Step 1: Extend auth-storage.ts with updateTokens() and subscribe()
- [ ] Step 2: Update auth-provider.tsx to listen for storage changes via useEffect
- [ ] Step 3: Add single-flight refresh to http-client.ts (401 interceptor with shared Promise)

---

## Task 12: Mount Toaster

**Files:** Modify apps/dashboard/src/app/providers.tsx

- [ ] Step 1: Import Toaster from sonner and mount after AuthProvider

---

## Task 13: Update documentation

**Files:** Modify CONTRACTS.md, apps/backend-api/CHECKPOINT.md, apps/dashboard/CHECKPOINT.md

- [ ] Step 1: Add Section 5.3 to CONTRACTS.md (Admin Monitoring API)
- [ ] Step 2: Update backend CHECKPOINT.md with monitoring endpoints entry
- [ ] Step 3: Update dashboard CHECKPOINT.md with monitoring pages + auth resilience entries

---

## Task 14: Final validation

- [ ] Step 1: pnpm --filter @kapter/contracts build
- [ ] Step 2: pnpm --filter backend-api build
- [ ] Step 3: pnpm --filter backend-api lint
- [ ] Step 4: pnpm --filter backend-api test
- [ ] Step 5: pnpm --filter dashboard typecheck
- [ ] Step 6: pnpm --filter dashboard lint
- [ ] Step 7: pnpm --filter dashboard build
