import { queryOptions } from "@tanstack/react-query"

import { getUsers, getUserById } from "@/features/users/users-api.ts"
import type { AdminUsersQueryParams } from "@/features/users/types.ts"

export const usersKeys = {
  all: ["users"] as const,
  list: (params: AdminUsersQueryParams) => ["users", "list", params] as const,
  detail: (id: string) => ["users", id] as const,
}

export const usersListQuery = (params: AdminUsersQueryParams = {}) =>
  queryOptions({
    queryKey: usersKeys.list(params),
    queryFn: () => getUsers(params),
    staleTime: 60_000,
  })

export const userDetailQuery = (id: string) =>
  queryOptions({
    queryKey: usersKeys.detail(id),
    queryFn: () => getUserById(id),
    staleTime: 60_000,
    enabled: !!id,
  })
