import { apiClient } from "@/shared/lib/http-client.ts"

import type { AdminOverview } from "@/features/overview/types.ts"

export const getOverview = async () => {
  return apiClient.get<AdminOverview>("/admin/overview")
}
