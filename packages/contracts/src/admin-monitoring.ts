export type AdminMonitoringFailureSource = "MEDIA" | "QUEUE";

export interface AdminMonitoringQueueItem {
  name: string;
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
  paused: number;
}

export interface AdminMonitoringQueueOverview {
  generatedAt: string;
  queues: AdminMonitoringQueueItem[];
}

export interface AdminMonitoringFailuresQuery {
  source: AdminMonitoringFailureSource;
  page?: number;
  limit?: number;
  search?: string;
  from?: string;
  to?: string;
  originType?: string;
  failCode?: string;
  queueName?: string;
}

export interface AdminMonitoringFailureSummary {
  failedMediaCount: number;
  failedQueueJobCount: number;
  availableFailCodes: string[];
}

export interface AdminMonitoringFailureItem {
  source: AdminMonitoringFailureSource;
  occurredAt: string;
  queueName: string | null;
  jobId: string | null;
  attemptsMade: number | null;
  mediaId: string | null;
  mediaTitle: string | null;
  userId: string | null;
  userEmail: string | null;
  originType: string | null;
  failCode: string | null;
  failReason: string | null;
  status: string | null;
}

export interface AdminMonitoringFailuresResponse {
  source: AdminMonitoringFailureSource;
  summary: AdminMonitoringFailureSummary;
  data: AdminMonitoringFailureItem[];
  total: number;
  page: number;
  limit: number;
}

export type AdminTranslationFinalizationPeriod = "7d" | "30d";

export interface AdminTranslationFinalizationSummaryQuery {
  period?: AdminTranslationFinalizationPeriod;
  sourceLanguage?: string;
  targetLanguage?: string;
  provider?: string;
  profile?: string;
}

export type AdminTranslationFinalizationHealthFilter =
  | "all"
  | "healthy"
  | "fallback"
  | "deadline_hit"
  | "failed_windows";

export interface AdminTranslationFinalizationMediaQuery
  extends AdminTranslationFinalizationSummaryQuery {
  page?: number;
  limit?: number;
  health?: AdminTranslationFinalizationHealthFilter;
}

export interface AdminTranslationFinalizationSummaryTotals {
  completedMedia: number;
  finalizedMedia: number;
  finalizationEnabledMedia: number;
  totalCostUsd: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalCoverageSegments: number;
  totalFallbackSegments: number;
  deadlineHitMedia: number;
  failedWindowMedia: number;
}

export interface AdminTranslationFinalizationSummaryAverages {
  costPerMediaUsd: number;
  costPerMediaMinuteUsd: number;
  tokensPerMedia: number;
  coverageRate: number;
  fallbackRate: number;
  averageWindowSuccessRate: number;
}

export interface AdminTranslationFinalizationProviderBreakdownItem {
  provider: string;
  mediaCount: number;
  totalCostUsd: number;
  totalTokens: number;
}

export interface AdminTranslationFinalizationProfileBreakdownItem {
  profile: string;
  mediaCount: number;
  totalCostUsd: number;
  averageCoverageRate: number;
}

export interface AdminTranslationFinalizationRouteBreakdownItem {
  sourceLanguage: string;
  targetLanguage: string;
  mediaCount: number;
  totalCostUsd: number;
  averageCoverageRate: number;
}

export interface AdminTranslationFinalizationDailyUsageItem {
  date: string;
  mediaCount: number;
  totalCostUsd: number;
  totalTokens: number;
  deadlineHits: number;
}

export interface AdminTranslationFinalizationSummaryResponse {
  period: AdminTranslationFinalizationPeriod;
  generatedAt: string;
  totals: AdminTranslationFinalizationSummaryTotals;
  averages: AdminTranslationFinalizationSummaryAverages;
  breakdowns: {
    byProvider: AdminTranslationFinalizationProviderBreakdownItem[];
    byProfile: AdminTranslationFinalizationProfileBreakdownItem[];
    byRoute: AdminTranslationFinalizationRouteBreakdownItem[];
    dailyUsage: AdminTranslationFinalizationDailyUsageItem[];
  };
}

export interface AdminTranslationFinalizationMediaListItem {
  mediaId: string;
  title: string;
  userEmail: string;
  sourceLanguage: string;
  targetLanguage: string;
  durationSeconds: number;
  completedAt: string;
  provider: string;
  model: string;
  profile: string;
  coverageSegments: number;
  fallbackSegments: number;
  attemptedWindows: number;
  completedWindows: number;
  failedWindows: number;
  timedOutWindows: number;
  invalidWindows: number;
  deadlineHit: boolean;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  llmRevisedSegments: number;
  nmtFallbackSegments: number;
}

export interface AdminTranslationFinalizationMediaListResponse {
  page: number;
  limit: number;
  total: number;
  data: AdminTranslationFinalizationMediaListItem[];
}
