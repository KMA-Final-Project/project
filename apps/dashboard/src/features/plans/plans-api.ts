import { apiClient } from "@/shared/lib/http-client.ts"

import type {
  SubscriptionPlan,
  AdminPlanDetail,
  CreatePlanPayload,
  UpdatePlanPayload,
  CreateVariantPayload,
  UpdateVariantPayload,
} from "@/features/plans/types.ts"

export const getPlans = async () => {
  return apiClient.get<SubscriptionPlan[]>("/admin/plans")
}

export const getPlanById = async (id: string): Promise<AdminPlanDetail> => {
  return apiClient.get<AdminPlanDetail>(`/admin/plans/${id}`)
}

export const createPlan = async (dto: CreatePlanPayload) => {
  return apiClient.post<SubscriptionPlan>("/admin/plans", dto)
}

export const updatePlan = async (id: string, dto: UpdatePlanPayload) => {
  return apiClient.patch<SubscriptionPlan>(`/admin/plans/${id}`, dto)
}

export const deletePlan = async (id: string) => {
  return apiClient.delete<{ message: string }>(`/admin/plans/${id}`)
}

export const createVariant = async (
  planId: string,
  dto: CreateVariantPayload,
) => {
  return apiClient.post(`/admin/plans/${planId}/variants`, dto)
}

export const updateVariant = async (id: string, dto: UpdateVariantPayload) => {
  return apiClient.patch(`/admin/variants/${id}`, dto)
}

export const deleteVariant = async (id: string) => {
  return apiClient.delete<{ message: string }>(`/admin/variants/${id}`)
}
