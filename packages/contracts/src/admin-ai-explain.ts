export type AiExplainPeriod = "7d" | "30d";

export interface AiExplainMetricsQuery {
  period?: AiExplainPeriod;
}

export interface AiExplainSessionsQuery {
  page?: number;
  limit?: number;
}

export interface AiExplainTopSegment {
  mediaId: string;
  mediaTitle: string;
  segmentIndex: number;
  segmentText: string;
  requestCount: number;
}

export interface AiExplainDailyUsage {
  date: string;
  requests: number;
  credits: number;
  tokens: number;
}

export interface AiExplainMetrics {
  period: AiExplainPeriod;
  totalRequests: number;
  totalCreditsConsumed: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  cacheHitRate: number;
  averageLatencyMs: number;
  guardrailRejectionRate: number;
  feedbackPositiveRate: number;
  topSegments: AiExplainTopSegment[];
  dailyUsage: AiExplainDailyUsage[];
}

export interface AiExplainSessionItem {
  id: string;
  userEmail: string;
  mediaTitle: string;
  segmentIndex: number;
  messageCount: number;
  updatedAt: string;
}

export interface AiExplainSessionsResponse {
  data: AiExplainSessionItem[];
  total: number;
  page: number;
  limit: number;
}
