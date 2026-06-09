export interface QueueOverviewItem {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

export interface AdminOverview {
  totalUsers: number;
  activeSubscriptions: number;
  processedMedia: number;
  failedMedia: number;
  processingMedia: number;
  queues: QueueOverviewItem[];
}
