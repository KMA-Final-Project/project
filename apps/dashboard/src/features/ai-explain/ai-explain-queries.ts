import { queryOptions } from "@tanstack/react-query"

import {
  getAiExplainMetrics,
  getAiExplainSessions,
} from "@/features/ai-explain/ai-explain-api.ts"

export const aiExplainKeys = {
  all: ["ai-explain"] as const,
  metrics: (period: "7d" | "30d") =>
    [...aiExplainKeys.all, "metrics", period] as const,
  sessions: (page: number, limit: number) =>
    [...aiExplainKeys.all, "sessions", page, limit] as const,
}

export const aiExplainMetricsQuery = (period: "7d" | "30d") =>
  queryOptions({
    queryKey: aiExplainKeys.metrics(period),
    queryFn: () => getAiExplainMetrics(period),
    staleTime: 60_000,
  })

export const aiExplainSessionsQuery = (page: number, limit: number) =>
  queryOptions({
    queryKey: aiExplainKeys.sessions(page, limit),
    queryFn: () => getAiExplainSessions(page, limit),
    staleTime: 60_000,
  })
