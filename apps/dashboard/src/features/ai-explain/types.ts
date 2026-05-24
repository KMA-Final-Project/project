export type AiExplainTopSegment = {
  mediaId: string
  mediaTitle: string
  segmentIndex: number
  segmentText: string
  requestCount: number
}

export type AiExplainDailyUsage = {
  date: string
  requests: number
  credits: number
  tokens: number
}

export type AiExplainMetrics = {
  period: string
  totalRequests: number
  totalCreditsConsumed: number
  totalTokensInput: number
  totalTokensOutput: number
  cacheHitRate: number
  averageLatencyMs: number
  guardrailRejectionRate: number
  feedbackPositiveRate: number
  topSegments: AiExplainTopSegment[]
  dailyUsage: AiExplainDailyUsage[]
}

export type AiExplainSessionItem = {
  id: string
  userEmail: string
  mediaTitle: string
  segmentIndex: number
  messageCount: number
  updatedAt: string
}

export type AiExplainSessionsResponse = {
  data: AiExplainSessionItem[]
  total: number
  page: number
  limit: number
}
