import { Injectable, Logger } from '@nestjs/common';
import { MediaStatus } from 'prisma/generated/client';
import {
  AdminMonitoringFailureItem,
  AdminMonitoringFailuresQuery,
  AdminMonitoringFailuresResponse,
  AdminMonitoringQueueOverview,
  AdminTranslationFinalizationHealthFilter,
  AdminTranslationFinalizationMediaListResponse,
  AdminTranslationFinalizationMediaQuery,
  AdminTranslationFinalizationSummaryQuery,
  AdminTranslationFinalizationSummaryResponse,
  SubtitleOutput,
  TranslationFinalizationMetadata,
} from '@kapter/contracts';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueueService } from 'src/modules/queue/queue.service';
import { MinioService } from 'src/modules/minio/minio.service';
import {
  TRANSCRIPTION_QUEUE,
  AI_PROCESSING_QUEUE,
} from 'src/modules/queue/queue.types';

const MAX_FINALIZATION_SCAN = 500;

type FailureSummary = {
  failedMediaCount: number;
  failedQueueJobCount: number;
  availableFailCodes: string[];
};

type CompletedMediaCandidate = {
  id: string;
  title: string;
  sourceLanguage: string | null;
  targetLanguage: string | null;
  durationSeconds: number;
  updatedAt: Date;
  user: {
    email: string;
  };
};

type TranslationFinalizationRecord = {
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
  totalSegmentCount: number;
  llmRevisedSegments: number;
  nmtFallbackSegments: number;
  metrics: TranslationFinalizationMetadata;
};

@Injectable()
export class MonitoringAdminService {
  private readonly logger = new Logger(MonitoringAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    private readonly minioService: MinioService,
  ) {}

  async getQueueOverview(): Promise<AdminMonitoringQueueOverview> {
    const queues = await this.queueService.getQueueOverview();
    return {
      generatedAt: new Date().toISOString(),
      queues,
    };
  }

  async getFailures(
    query: AdminMonitoringFailuresQuery,
  ): Promise<AdminMonitoringFailuresResponse> {
    const source = query.source;
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [failedMediaCount, failedQueueJobCount, availableFailCodes] =
      await Promise.all([
        this.prisma.mediaItem.count({
          where: { deletedAt: null, status: MediaStatus.FAILED },
        }),
        this.getFailedQueueJobCount(),
        this.getAvailableFailCodes(),
      ]);

    const summary: FailureSummary = {
      failedMediaCount,
      failedQueueJobCount,
      availableFailCodes,
    };

    if (source === 'MEDIA') {
      return this.getMediaFailures(query, summary, page, limit);
    }

    return this.getQueueFailures(query, summary, page, limit);
  }

  async getTranslationFinalizationSummary(
    query: AdminTranslationFinalizationSummaryQuery,
  ): Promise<AdminTranslationFinalizationSummaryResponse> {
    const period = query.period ?? '7d';
    const candidates = await this.getCompletedMediaCandidates(period);
    const records = await this.getTranslationFinalizationRecords(candidates);
    const filtered = this.filterTranslationFinalizationRecords(records, query);

    const totals = filtered.reduce(
      (acc, record) => {
        acc.totalCostUsd += record.metrics.total_cost_usd;
        acc.totalPromptTokens += record.metrics.total_prompt_tokens;
        acc.totalCompletionTokens += record.metrics.total_completion_tokens;
        acc.totalTokens += record.metrics.total_tokens;
        acc.totalCoverageSegments += record.metrics.coverage_segments;
        acc.totalFallbackSegments += record.metrics.fallback_segments;
        acc.deadlineHitMedia += record.metrics.finalization_deadline_hit
          ? 1
          : 0;
        acc.failedWindowMedia +=
          record.metrics.failed_windows > 0 ||
          record.metrics.invalid_windows > 0 ||
          record.metrics.timed_out_windows > 0
            ? 1
            : 0;
        return acc;
      },
      {
        completedMedia: candidates.length,
        finalizedMedia: filtered.length,
        finalizationEnabledMedia: filtered.length,
        totalCostUsd: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        totalTokens: 0,
        totalCoverageSegments: 0,
        totalFallbackSegments: 0,
        deadlineHitMedia: 0,
        failedWindowMedia: 0,
      },
    );

    const totalDurationMinutes = filtered.reduce(
      (sum, record) => sum + record.durationSeconds / 60,
      0,
    );
    const totalSegments = filtered.reduce(
      (sum, record) => sum + record.totalSegmentCount,
      0,
    );
    const totalAttemptedWindows = filtered.reduce(
      (sum, record) => sum + record.metrics.attempted_windows,
      0,
    );
    const totalCompletedWindows = filtered.reduce(
      (sum, record) => sum + record.metrics.completed_windows,
      0,
    );

    const averages = {
      costPerMediaUsd: this.safeDivide(totals.totalCostUsd, filtered.length),
      costPerMediaMinuteUsd: this.safeDivide(
        totals.totalCostUsd,
        totalDurationMinutes,
      ),
      tokensPerMedia: this.safeDivide(totals.totalTokens, filtered.length),
      coverageRate: this.safeDivide(
        totals.totalCoverageSegments,
        totalSegments,
      ),
      fallbackRate: this.safeDivide(
        totals.totalFallbackSegments,
        totalSegments,
      ),
      averageWindowSuccessRate: this.safeDivide(
        totalCompletedWindows,
        totalAttemptedWindows,
      ),
    };

    return {
      period,
      generatedAt: new Date().toISOString(),
      totals: {
        ...totals,
        totalCostUsd: this.round(totals.totalCostUsd, 6),
      },
      averages: {
        ...averages,
        costPerMediaUsd: this.round(averages.costPerMediaUsd, 6),
        costPerMediaMinuteUsd: this.round(averages.costPerMediaMinuteUsd, 6),
        coverageRate: this.round(averages.coverageRate, 4),
        fallbackRate: this.round(averages.fallbackRate, 4),
        averageWindowSuccessRate: this.round(
          averages.averageWindowSuccessRate,
          4,
        ),
      },
      breakdowns: {
        byProvider: this.buildProviderBreakdown(filtered),
        byProfile: this.buildProfileBreakdown(filtered),
        byRoute: this.buildRouteBreakdown(filtered),
        dailyUsage: this.buildDailyUsageBreakdown(period, filtered),
      },
    };
  }

  async getTranslationFinalizationMedia(
    query: AdminTranslationFinalizationMediaQuery,
  ): Promise<AdminTranslationFinalizationMediaListResponse> {
    const period = query.period ?? '7d';
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const candidates = await this.getCompletedMediaCandidates(period);
    const records = await this.getTranslationFinalizationRecords(candidates);
    const filtered = this.filterTranslationFinalizationRecords(records, query)
      .filter((record) =>
        this.matchesHealthFilter(record, query.health ?? 'all'),
      )
      .sort(
        (left, right) =>
          new Date(right.completedAt).getTime() -
          new Date(left.completedAt).getTime(),
      );

    const start = (page - 1) * limit;
    const data = filtered.slice(start, start + limit).map((record) => ({
      mediaId: record.mediaId,
      title: record.title,
      userEmail: record.userEmail,
      sourceLanguage: record.sourceLanguage,
      targetLanguage: record.targetLanguage,
      durationSeconds: record.durationSeconds,
      completedAt: record.completedAt,
      provider: record.provider,
      model: record.model,
      profile: record.profile,
      coverageSegments: record.metrics.coverage_segments,
      fallbackSegments: record.metrics.fallback_segments,
      attemptedWindows: record.metrics.attempted_windows,
      completedWindows: record.metrics.completed_windows,
      failedWindows: record.metrics.failed_windows,
      timedOutWindows: record.metrics.timed_out_windows,
      invalidWindows: record.metrics.invalid_windows,
      deadlineHit: record.metrics.finalization_deadline_hit,
      totalPromptTokens: record.metrics.total_prompt_tokens,
      totalCompletionTokens: record.metrics.total_completion_tokens,
      totalTokens: record.metrics.total_tokens,
      totalCostUsd: this.round(record.metrics.total_cost_usd, 6),
      llmRevisedSegments: record.llmRevisedSegments,
      nmtFallbackSegments: record.nmtFallbackSegments,
    }));

    return {
      page,
      limit,
      total: filtered.length,
      data,
    };
  }

  private async getMediaFailures(
    query: AdminMonitoringFailuresQuery,
    summary: FailureSummary,
    page: number,
    limit: number,
  ): Promise<AdminMonitoringFailuresResponse> {
    const where: Record<string, unknown> = {
      deletedAt: null,
      status: MediaStatus.FAILED,
    };

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { id: { contains: query.search, mode: 'insensitive' } },
        { user: { email: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    if (query.from || query.to) {
      where.updatedAt = {};
      if (query.from)
        (where.updatedAt as Record<string, unknown>).gte = new Date(query.from);
      if (query.to)
        (where.updatedAt as Record<string, unknown>).lte = this.endOfDay(
          query.to,
        );
    }

    if (query.originType) {
      where.originType = query.originType;
    }

    if (query.failCode) {
      where.failCode = query.failCode;
    }

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.mediaItem.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          user: { select: { id: true, email: true } },
        },
      }),
      this.prisma.mediaItem.count({ where }),
    ]);

    const data: AdminMonitoringFailureItem[] = items.map((item) => ({
      source: 'MEDIA' as const,
      occurredAt: item.updatedAt.toISOString(),
      queueName: null,
      jobId: null,
      attemptsMade: null,
      mediaId: item.id,
      mediaTitle: item.title,
      userId: item.user.id,
      userEmail: item.user.email,
      originType: item.originType,
      failCode: item.failCode,
      failReason: item.failReason,
      status: item.status,
    }));

    return { source: 'MEDIA', summary, data, total, page, limit };
  }

  private async getQueueFailures(
    query: AdminMonitoringFailuresQuery,
    summary: FailureSummary,
    page: number,
    limit: number,
  ): Promise<AdminMonitoringFailuresResponse> {
    const failedJobs = await this.queueService.getFailedJobs(query.queueName);

    let mapped: AdminMonitoringFailureItem[] = failedJobs.map((job) => ({
      source: 'QUEUE' as const,
      occurredAt: new Date(job.finishedOn).toISOString(),
      queueName: job.queueName,
      jobId: job.jobId,
      attemptsMade: job.attemptsMade,
      mediaId: (job.data?.mediaId as string) ?? null,
      mediaTitle: null,
      userId: (job.data?.userId as string) ?? null,
      userEmail: null,
      originType: (job.data?.type as string) ?? null,
      failCode: null,
      failReason: job.failedReason,
      status: null,
    }));

    if (query.search) {
      const term = query.search.toLowerCase();
      mapped = mapped.filter(
        (item) =>
          item.jobId?.toLowerCase().includes(term) ||
          item.mediaId?.toLowerCase().includes(term) ||
          item.failReason?.toLowerCase().includes(term),
      );
    }

    if (query.from) {
      const fromDate = new Date(query.from);
      mapped = mapped.filter((item) => new Date(item.occurredAt) >= fromDate);
    }

    if (query.to) {
      const toDate = this.endOfDay(query.to);
      mapped = mapped.filter((item) => new Date(item.occurredAt) <= toDate);
    }

    mapped.sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );

    const total = mapped.length;
    const data = mapped.slice((page - 1) * limit, page * limit);

    return { source: 'QUEUE', summary, data, total, page, limit };
  }

  private async getFailedQueueJobCount(): Promise<number> {
    const [transcription, aiProcessing] = await Promise.all([
      this.queueService.getFailedJobs(TRANSCRIPTION_QUEUE),
      this.queueService.getFailedJobs(AI_PROCESSING_QUEUE),
    ]);
    return transcription.length + aiProcessing.length;
  }

  private async getAvailableFailCodes(): Promise<string[]> {
    const codes = await this.prisma.mediaItem.findMany({
      where: {
        deletedAt: null,
        status: MediaStatus.FAILED,
        failCode: { not: null },
      },
      select: { failCode: true },
      distinct: ['failCode'],
    });
    return codes.map((c) => c.failCode!).filter(Boolean);
  }

  private async getCompletedMediaCandidates(
    period: '7d' | '30d',
  ): Promise<CompletedMediaCandidate[]> {
    const since = this.startOfUtcDay(
      this.addDays(new Date(), -(this.periodToDays(period) - 1)),
    );

    return this.prisma.mediaItem.findMany({
      where: {
        deletedAt: null,
        status: MediaStatus.COMPLETED,
        updatedAt: {
          gte: since,
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: MAX_FINALIZATION_SCAN,
      select: {
        id: true,
        title: true,
        sourceLanguage: true,
        targetLanguage: true,
        durationSeconds: true,
        updatedAt: true,
        user: {
          select: {
            email: true,
          },
        },
      },
    });
  }

  private async getTranslationFinalizationRecords(
    candidates: CompletedMediaCandidate[],
  ): Promise<TranslationFinalizationRecord[]> {
    const records = await Promise.all(
      candidates.map((candidate) =>
        this.readTranslationFinalizationRecord(candidate),
      ),
    );

    return records.filter(
      (record): record is TranslationFinalizationRecord => record !== null,
    );
  }

  private async readTranslationFinalizationRecord(
    media: CompletedMediaCandidate,
  ): Promise<TranslationFinalizationRecord | null> {
    try {
      const finalArtifact =
        await this.minioService.readProcessedJson<SubtitleOutput>(
          `${media.id}/final.json`,
        );

      const metadata = finalArtifact.metadata.translation_finalization;
      if (!metadata?.enabled) {
        return null;
      }

      const totalSegmentCount = finalArtifact.segments.length;
      const llmRevisedSegments = metadata.segment_provenance.filter(
        (entry) => entry.source === 'llm_revision',
      ).length;
      const nmtFallbackSegments = metadata.segment_provenance.filter(
        (entry) => entry.source === 'nmt',
      ).length;

      return {
        mediaId: media.id,
        title: media.title,
        userEmail: media.user.email,
        sourceLanguage:
          finalArtifact.metadata.source_lang || media.sourceLanguage || '',
        targetLanguage:
          finalArtifact.metadata.target_lang || media.targetLanguage || '',
        durationSeconds:
          finalArtifact.metadata.duration || media.durationSeconds || 0,
        completedAt: media.updatedAt.toISOString(),
        provider: metadata.provider,
        model: metadata.model,
        profile: metadata.applied_profile,
        totalSegmentCount,
        llmRevisedSegments,
        nmtFallbackSegments,
        metrics: metadata,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Skipping unreadable translation finalization artifact for media ${media.id}: ${message}`,
      );
      return null;
    }
  }

  private filterTranslationFinalizationRecords(
    records: TranslationFinalizationRecord[],
    query:
      | AdminTranslationFinalizationSummaryQuery
      | AdminTranslationFinalizationMediaQuery,
  ): TranslationFinalizationRecord[] {
    return records.filter((record) => {
      if (
        query.sourceLanguage &&
        record.sourceLanguage !== query.sourceLanguage
      ) {
        return false;
      }

      if (
        query.targetLanguage &&
        record.targetLanguage !== query.targetLanguage
      ) {
        return false;
      }

      if (query.provider && record.provider !== query.provider) {
        return false;
      }

      if (query.profile && record.profile !== query.profile) {
        return false;
      }

      return true;
    });
  }

  private matchesHealthFilter(
    record: TranslationFinalizationRecord,
    health: AdminTranslationFinalizationHealthFilter,
  ): boolean {
    if (health === 'all') {
      return true;
    }

    if (health === 'healthy') {
      return (
        !record.metrics.finalization_deadline_hit &&
        record.metrics.fallback_segments === 0 &&
        record.metrics.failed_windows === 0 &&
        record.metrics.invalid_windows === 0 &&
        record.metrics.timed_out_windows === 0
      );
    }

    if (health === 'fallback') {
      return record.metrics.fallback_segments > 0;
    }

    if (health === 'deadline_hit') {
      return record.metrics.finalization_deadline_hit;
    }

    return (
      record.metrics.failed_windows > 0 ||
      record.metrics.invalid_windows > 0 ||
      record.metrics.timed_out_windows > 0
    );
  }

  private buildProviderBreakdown(records: TranslationFinalizationRecord[]) {
    const grouped = new Map<
      string,
      {
        provider: string;
        mediaCount: number;
        totalCostUsd: number;
        totalTokens: number;
      }
    >();

    for (const record of records) {
      const key = record.provider || 'unknown';
      const current = grouped.get(key) ?? {
        provider: key,
        mediaCount: 0,
        totalCostUsd: 0,
        totalTokens: 0,
      };
      current.mediaCount += 1;
      current.totalCostUsd += record.metrics.total_cost_usd;
      current.totalTokens += record.metrics.total_tokens;
      grouped.set(key, current);
    }

    return [...grouped.values()]
      .sort((left, right) => right.mediaCount - left.mediaCount)
      .map((item) => ({
        ...item,
        totalCostUsd: this.round(item.totalCostUsd, 6),
      }));
  }

  private buildProfileBreakdown(records: TranslationFinalizationRecord[]) {
    const grouped = new Map<
      string,
      {
        profile: string;
        mediaCount: number;
        totalCostUsd: number;
        totalSegments: number;
        totalCoverageSegments: number;
      }
    >();

    for (const record of records) {
      const key = record.profile || 'unknown';
      const current = grouped.get(key) ?? {
        profile: key,
        mediaCount: 0,
        totalCostUsd: 0,
        totalSegments: 0,
        totalCoverageSegments: 0,
      };
      current.mediaCount += 1;
      current.totalCostUsd += record.metrics.total_cost_usd;
      current.totalSegments += record.totalSegmentCount;
      current.totalCoverageSegments += record.metrics.coverage_segments;
      grouped.set(key, current);
    }

    return [...grouped.values()]
      .sort((left, right) => right.mediaCount - left.mediaCount)
      .map((item) => ({
        profile: item.profile,
        mediaCount: item.mediaCount,
        totalCostUsd: this.round(item.totalCostUsd, 6),
        averageCoverageRate: this.round(
          this.safeDivide(item.totalCoverageSegments, item.totalSegments),
          4,
        ),
      }));
  }

  private buildRouteBreakdown(records: TranslationFinalizationRecord[]) {
    const grouped = new Map<
      string,
      {
        sourceLanguage: string;
        targetLanguage: string;
        mediaCount: number;
        totalCostUsd: number;
        totalSegments: number;
        totalCoverageSegments: number;
      }
    >();

    for (const record of records) {
      const key = `${record.sourceLanguage}->${record.targetLanguage}`;
      const current = grouped.get(key) ?? {
        sourceLanguage: record.sourceLanguage,
        targetLanguage: record.targetLanguage,
        mediaCount: 0,
        totalCostUsd: 0,
        totalSegments: 0,
        totalCoverageSegments: 0,
      };
      current.mediaCount += 1;
      current.totalCostUsd += record.metrics.total_cost_usd;
      current.totalSegments += record.totalSegmentCount;
      current.totalCoverageSegments += record.metrics.coverage_segments;
      grouped.set(key, current);
    }

    return [...grouped.values()]
      .sort((left, right) => right.mediaCount - left.mediaCount)
      .map((item) => ({
        sourceLanguage: item.sourceLanguage,
        targetLanguage: item.targetLanguage,
        mediaCount: item.mediaCount,
        totalCostUsd: this.round(item.totalCostUsd, 6),
        averageCoverageRate: this.round(
          this.safeDivide(item.totalCoverageSegments, item.totalSegments),
          4,
        ),
      }));
  }

  private buildDailyUsageBreakdown(
    period: '7d' | '30d',
    records: TranslationFinalizationRecord[],
  ) {
    const days = this.periodToDays(period);
    const since = this.startOfUtcDay(this.addDays(new Date(), -(days - 1)));
    const grouped = new Map<
      string,
      {
        date: string;
        mediaCount: number;
        totalCostUsd: number;
        totalTokens: number;
        deadlineHits: number;
      }
    >();

    for (let index = 0; index < days; index += 1) {
      const date = this.toDateKey(this.addDays(since, index));
      grouped.set(date, {
        date,
        mediaCount: 0,
        totalCostUsd: 0,
        totalTokens: 0,
        deadlineHits: 0,
      });
    }

    for (const record of records) {
      const key = this.toDateKey(new Date(record.completedAt));
      const bucket = grouped.get(key);
      if (!bucket) {
        continue;
      }

      bucket.mediaCount += 1;
      bucket.totalCostUsd += record.metrics.total_cost_usd;
      bucket.totalTokens += record.metrics.total_tokens;
      bucket.deadlineHits += record.metrics.finalization_deadline_hit ? 1 : 0;
    }

    return [...grouped.values()].map((item) => ({
      ...item,
      totalCostUsd: this.round(item.totalCostUsd, 6),
    }));
  }

  private periodToDays(period: '7d' | '30d'): number {
    return period === '30d' ? 30 : 7;
  }

  private safeDivide(numerator: number, denominator: number): number {
    if (denominator === 0) {
      return 0;
    }

    return numerator / denominator;
  }

  private round(value: number, digits: number): number {
    return Number(value.toFixed(digits));
  }

  private addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  private startOfUtcDay(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }

  private toDateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private endOfDay(dateStr: string): Date {
    const d = new Date(dateStr);
    d.setHours(23, 59, 59, 999);
    return d;
  }
}
