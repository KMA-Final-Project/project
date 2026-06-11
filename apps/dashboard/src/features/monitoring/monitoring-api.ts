import { apiClient } from "@/shared/lib/http-client.ts"

import type {
  AdminMonitoringQueueOverview,
  AdminMonitoringFailuresQuery,
  AdminMonitoringFailuresResponse,
  AdminTranslationFinalizationSummaryQuery,
  AdminTranslationFinalizationSummaryResponse,
  AdminTranslationFinalizationMediaQuery,
  AdminTranslationFinalizationMediaListResponse,
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

export const getTranslationFinalizationSummary = async (
  params: AdminTranslationFinalizationSummaryQuery,
): Promise<AdminTranslationFinalizationSummaryResponse> => {
  const searchParams = new URLSearchParams()
  if (params.period) searchParams.set("period", params.period)
  if (params.sourceLanguage) {
    searchParams.set("sourceLanguage", params.sourceLanguage)
  }
  if (params.targetLanguage) {
    searchParams.set("targetLanguage", params.targetLanguage)
  }
  if (params.provider) searchParams.set("provider", params.provider)
  if (params.profile) searchParams.set("profile", params.profile)

  return apiClient.get<AdminTranslationFinalizationSummaryResponse>(
    `/admin/monitoring/translation-finalization/summary?${searchParams.toString()}`,
  )
}

export const getTranslationFinalizationMedia = async (
  params: AdminTranslationFinalizationMediaQuery,
): Promise<AdminTranslationFinalizationMediaListResponse> => {
  const searchParams = new URLSearchParams()
  if (params.period) searchParams.set("period", params.period)
  if (params.page) searchParams.set("page", String(params.page))
  if (params.limit) searchParams.set("limit", String(params.limit))
  if (params.health) searchParams.set("health", params.health)
  if (params.sourceLanguage) {
    searchParams.set("sourceLanguage", params.sourceLanguage)
  }
  if (params.targetLanguage) {
    searchParams.set("targetLanguage", params.targetLanguage)
  }
  if (params.provider) searchParams.set("provider", params.provider)
  if (params.profile) searchParams.set("profile", params.profile)

  return apiClient.get<AdminTranslationFinalizationMediaListResponse>(
    `/admin/monitoring/translation-finalization/media?${searchParams.toString()}`,
  )
}
