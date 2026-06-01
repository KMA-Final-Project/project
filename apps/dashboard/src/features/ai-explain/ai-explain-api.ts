import { apiClient } from "@/shared/lib/http-client.ts"

import type {
  AiExplainMetrics,
  AiExplainSessionsResponse,
} from "@/features/ai-explain/types.ts"

export const getAiExplainMetrics = async (period: "7d" | "30d") => {
  return apiClient.get<AiExplainMetrics>(
    `/admin/ai-explain/metrics?period=${period}`
  )
}

export const getAiExplainSessions = async (page: number, limit: number) => {
  return apiClient.get<AiExplainSessionsResponse>(
    `/admin/ai-explain/sessions?page=${page}&limit=${limit}`
  )
}
