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
