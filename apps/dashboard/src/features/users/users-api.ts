import { apiClient } from "@/shared/lib/http-client.ts"

import type {
  AdminUserListResponse,
  AdminUserDetail,
  UsersQueryParams,
} from "@/features/users/types.ts"

export const getUsers = async (
  params: UsersQueryParams = {},
): Promise<AdminUserListResponse> => {
  const { page = 1, limit = 20 } = params
  return apiClient.get<AdminUserListResponse>(
    `/admin/users?page=${page}&limit=${limit}`,
  )
}

export const getUserById = async (id: string): Promise<AdminUserDetail> => {
  return apiClient.get<AdminUserDetail>(`/admin/users/${id}`)
}
