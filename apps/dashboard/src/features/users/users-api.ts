import { apiClient } from "@/shared/lib/http-client.ts"

import type {
  AdminUserListResponse,
  AdminUserDetail,
  AdminUsersQueryParams,
  AdminUserRoleUpdateResult,
} from "@/features/users/types.ts"

export const getUsers = async (
  params: AdminUsersQueryParams = {},
): Promise<AdminUserListResponse> => {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set("page", String(params.page))
  if (params.limit) searchParams.set("limit", String(params.limit))
  if (params.search) searchParams.set("search", params.search)
  if (params.role) searchParams.set("role", params.role)
  if (params.planId) searchParams.set("planId", params.planId)
  if (params.variantId) searchParams.set("variantId", params.variantId)

  const qs = searchParams.toString()
  return apiClient.get<AdminUserListResponse>(`/admin/users${qs ? `?${qs}` : ""}`)
}

export const getUserById = async (id: string): Promise<AdminUserDetail> => {
  return apiClient.get<AdminUserDetail>(`/admin/users/${id}`)
}

export const updateUserRole = async (
  id: string,
  role: "USER" | "ADMIN",
): Promise<AdminUserRoleUpdateResult> => {
  return apiClient.patch<AdminUserRoleUpdateResult>(
    `/admin/users/${id}/role`,
    { role },
  )
}
