import { apiClient } from "@/shared/lib/http-client.ts"

import type {
  AdminMonitoringQueueOverview,
  AdminMonitoringFailuresQuery,
  AdminMonitoringFailuresResponse,
} from "@/features/monitoring/types.ts"

export const getMonitoringQueues =
  async (): Promise<AdminMonitoringQueueOverview> => {
    return apiClient.get<AdminMonitoringQueueOverview>(
      "/admin/monitoring/queues",
    )
  }

export const getMonitoringFailures = async (
  params: AdminMonitoringFailuresQuery,
): Promise<AdminMonitoringFailuresResponse> => {
  const searchParams = new URLSearchParams()
  searchParams.set("source", params.source)
  if (params.page) searchParams.set("page", String(params.page))
  if (params.limit) searchParams.set("limit", String(params.limit))
  if (params.search) searchParams.set("search", params.search)
  if (params.from) searchParams.set("from", params.from)
  if (params.to) searchParams.set("to", params.to)
  if (params.originType) searchParams.set("originType", params.originType)
  if (params.failCode) searchParams.set("failCode", params.failCode)
  if (params.queueName) searchParams.set("queueName", params.queueName)

  return apiClient.get<AdminMonitoringFailuresResponse>(
    `/admin/monitoring/failures?${searchParams.toString()}`,
  )
}
