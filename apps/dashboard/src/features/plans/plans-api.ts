import { apiClient } from "@/shared/lib/http-client.ts"

import type { SubscriptionPlan } from "@/features/plans/types.ts"

export const getPlans = async () => {
  return apiClient.get<SubscriptionPlan[]>("/admin/plans")
}
