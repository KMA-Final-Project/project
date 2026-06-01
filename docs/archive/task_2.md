# Task: Dashboard /users & /plans Full Management

Decisions recorded:
- No role-change UI (admin is seed-only, read-only role display)
- Client-side search/filter for users (admin-only endpoint, simplicity wins)
- Offset-based pagination
- Plan detail via slide-over drawer (not a separate route)
- JWT refresh deferred to follow-up

---

## Phase 1 — Backend: Admin User Endpoints

- [/] Create `user.dto.ts` — AdminUsersQueryDto, AdminUserListItemDto, AdminUserDetailDto, AdminUserListResponseDto
- [ ] Create `user-admin.service.ts` — findAll(), findById()
- [ ] Extend `admin.controller.ts` — GET /admin/users, GET /admin/users/:id
- [ ] Extend `admin.module.ts` — add UserAdminService

## Phase 2 — HTTP Client

- [ ] Add `patch()` and `delete()` methods to `http-client.ts`

## Phase 3 — Plans Write Operations

- [ ] Extend `plans-api.ts` + `types.ts` with mutation functions and payload types
- [ ] Build `plan-form-dialog.tsx` (create + edit plan)
- [ ] Build `variant-form-dialog.tsx` (create + edit variant, versioning warning)
- [ ] Build `confirm-dialog.tsx` (generic destructive confirm)
- [ ] Extend `plans-page.tsx` with action buttons + mutations

## Phase 4 — Users Feature

- [ ] Create `users/types.ts`
- [ ] Create `users/users-api.ts` (getUsers, getUserById)
- [ ] Create `users/users-queries.ts`
- [ ] Implement `users-page.tsx` (full list + client-side filter + pagination)
- [ ] Implement `user-detail-page.tsx` (profile + subscription + usage history)
- [ ] Add `/users/:id` route to `router.tsx`

## Phase 5 — Checkpoint Updates

- [ ] Update `apps/dashboard/CHECKPOINT.md`
- [ ] Update `apps/backend-api/CHECKPOINT.md`
