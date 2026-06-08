# Plan Detail + Role Management Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task.

**Goal:** Build dedicated plan detail page, server-side user filters, and role management.

**Tech Stack:** NestJS, Prisma, React 19, TanStack Query 5, React Router 7, shadcn/ui, Tailwind CSS v4, sonner

---

## File Map

### Create
- apps/dashboard/src/features/plans/pages/plan-detail-page.tsx
- apps/dashboard/src/features/users/components/role-change-dialog.tsx

### Modify
- packages/contracts/src/admin-plans.ts (add AdminPlanDetail types)
- packages/contracts/src/admin-users.ts (extend query params, add role types)
- apps/backend-api/src/modules/admin/services/plan.service.ts (findByIdWithMetrics)
- apps/backend-api/src/modules/admin/services/user-admin.service.ts (filters + role update)
- apps/backend-api/src/modules/admin/admin.controller.ts (PATCH role endpoint)
- apps/backend-api/src/modules/admin/dto/user.dto.ts (filter DTOs + role DTOs)
- apps/backend-api/src/modules/admin/dto/plan.dto.ts (AdminPlanDetailDto)
- apps/dashboard/src/features/plans/plans-api.ts (getPlanById)
- apps/dashboard/src/features/plans/plans-queries.ts (planDetailQuery)
- apps/dashboard/src/features/plans/types.ts (add AdminPlanDetail)
- apps/dashboard/src/features/plans/pages/plans-page.tsx (simplify to inventory)
- apps/dashboard/src/features/users/users-api.ts (add updateUserRole)
- apps/dashboard/src/features/users/users-queries.ts (add filter params)
- apps/dashboard/src/features/users/pages/users-page.tsx (server-side filters + role)
- apps/dashboard/src/features/users/pages/user-detail-page.tsx (role card)
- apps/dashboard/src/app/router.tsx (add /plans/:id route)
- CONTRACTS.md, CHECKPOINT.md files

---

## Task 1: Add contract types to packages/contracts

- [ ] Step 1: Add AdminPlanSubscriptionMetrics, AdminPlanVariantDetail, AdminPlanDetail to admin-plans.ts
- [ ] Step 2: Extend AdminUsersQueryParams with search, role, planId, variantId in admin-users.ts
- [ ] Step 3: Add UpdateAdminUserRolePayload, AdminUserRoleUpdateResult to admin-users.ts
- [ ] Step 4: Build contracts: pnpm --filter @kapter/contracts build

---

## Task 2: Enhance plan detail endpoint

- [ ] Step 1: Add findByIdWithMetrics to PlanService (counts activeCurrentSubscribers and historicalSubscriptions per variant)
- [ ] Step 2: Add AdminPlanDetailDto, AdminPlanVariantDetailDto, AdminPlanSubscriptionMetricsDto to plan.dto.ts
- [ ] Step 3: Update AdminController findPlanById to use findByIdWithMetrics
- [ ] Step 4: Build backend: pnpm --filter backend-api build

---

## Task 3: Extend user admin service

- [ ] Step 1: Update AdminUsersQueryDto with search, role, planId, variantId fields
- [ ] Step 2: Add UpdateAdminUserRoleDto, AdminUserRoleUpdateResultDto to user.dto.ts
- [ ] Step 3: Update UserAdminService.findAll to build Prisma where clause from filters
- [ ] Step 4: Add UserAdminService.updateRole with self-demotion and last-admin checks
- [ ] Step 5: Build backend: pnpm --filter backend-api build

---

## Task 4: Wire role update endpoint

- [ ] Step 1: Add PATCH /admin/users/:id/role to AdminController
- [ ] Step 2: Build backend: pnpm --filter backend-api build

---

## Task 5: Backend unit tests

- [ ] Step 1: Plan service test for findByIdWithMetrics
- [ ] Step 2: User admin service tests for filters and role update
- [ ] Step 3: Run tests: pnpm --filter backend-api test

---

## Task 6: Dashboard plan detail API layer

- [ ] Step 1: Update plans/types.ts to re-export AdminPlanDetail types
- [ ] Step 2: Add getPlanById to plans-api.ts
- [ ] Step 3: Add planDetailQuery to plans-queries.ts

---

## Task 7: Dashboard role management API layer

- [ ] Step 1: Update users/types.ts to re-export role types
- [ ] Step 2: Add updateUserRole to users-api.ts
- [ ] Step 3: Update usersListQuery to accept filter params

---

## Task 8: Create role change dialog

- [ ] Step 1: Create role-change-dialog.tsx with confirmation, self-demotion warning, destructive styling for demotion

---

## Task 9: Build plan detail page

- [ ] Step 1: Create plan-detail-page.tsx (header, summary cards, plan actions, variant cards with metrics, subscriber links)
- [ ] Step 2: Add /plans/:id route to router.tsx
- [ ] Step 3: Build dashboard: pnpm --filter dashboard build

---

## Task 10: Simplify plans list page

- [ ] Step 1: Remove edit/deactivate/add-variant controls from PlanCard, make each card link to /plans/:id
- [ ] Step 2: Build dashboard: pnpm --filter dashboard build

---

## Task 11: Update users page

- [ ] Step 1: Move filters to useSearchParams, add server-side query params
- [ ] Step 2: Add role change button per row with RoleChangeDialog
- [ ] Step 3: Build dashboard: pnpm --filter dashboard build

---

## Task 12: Add role management to user detail

- [ ] Step 1: Add RoleManagementCard to user-detail-page.tsx
- [ ] Step 2: Build dashboard: pnpm --filter dashboard build

---

## Task 13: Update documentation

- [ ] Step 1: Add plan detail + role management sections to CONTRACTS.md
- [ ] Step 2: Update backend CHECKPOINT.md
- [ ] Step 3: Update dashboard CHECKPOINT.md

---

## Task 14: Final validation

- [ ] pnpm --filter @kapter/contracts build
- [ ] pnpm --filter backend-api build && lint && test
- [ ] pnpm --filter dashboard typecheck && lint && build
