import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import type {
  AiExplainDailyUsageDto,
  AiExplainMetricsDto,
  AiExplainMetricsQueryDto,
  AiExplainSessionsQueryDto,
  AiExplainSessionsResponseDto,
  AiExplainTopSegmentDto,
} from '../dto/ai-explain.dto';

@Injectable()
export class AiExplainAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getMetrics(
    query: AiExplainMetricsQueryDto,
  ): Promise<AiExplainMetricsDto> {
    const period = query.period ?? '7d';
    const days = period === '30d' ? 30 : 7;
    const since = startOfUtcDay(addDays(new Date(), -(days - 1)));

    const [logs, feedbackTotal, feedbackPositive, groupedSegments] =
      await Promise.all([
        this.prisma.aiUsageLog.findMany({
          where: { createdAt: { gte: since } },
          select: {
            mediaId: true,
            segmentIndex: true,
            segmentText: true,
            creditsConsumed: true,
            tokensInput: true,
            tokensOutput: true,
            latencyMs: true,
            cacheHit: true,
            rejected: true,
            createdAt: true,
          },
        }),
        this.prisma.chatFeedback.count({
          where: { createdAt: { gte: since } },
        }),
        this.prisma.chatFeedback.count({
          where: { createdAt: { gte: since }, rating: 'POSITIVE' },
        }),
        this.prisma.aiUsageLog.groupBy({
          by: ['mediaId', 'segmentIndex'],
          where: { createdAt: { gte: since } },
          _count: { _all: true },
          orderBy: { _count: { id: 'desc' } },
          take: 5,
        }),
      ]);

    const mediaIds = [...new Set(groupedSegments.map((item) => item.mediaId))];
    const mediaItems = await this.prisma.mediaItem.findMany({
      where: { id: { in: mediaIds } },
      select: { id: true, title: true },
    });
    const mediaTitleById = new Map(
      mediaItems.map((item) => [item.id, item.title]),
    );

    const topSegments: AiExplainTopSegmentDto[] = groupedSegments.map(
      (segment) => {
        const latestLog = logs.find(
          (log) =>
            log.mediaId === segment.mediaId &&
            log.segmentIndex === segment.segmentIndex,
        );

        return {
          mediaId: segment.mediaId,
          mediaTitle: mediaTitleById.get(segment.mediaId) ?? 'Unknown media',
          segmentIndex: segment.segmentIndex,
          segmentText:
            latestLog?.segmentText ?? `Segment #${segment.segmentIndex + 1}`,
          requestCount: segment._count._all,
        };
      },
    );

    const dailyUsage = this.buildDailyUsage(days, since, logs);
    const totalRequests = logs.length;
    const totalCreditsConsumed = sum(logs, (log) => log.creditsConsumed);
    const totalTokensInput = sum(logs, (log) => log.tokensInput);
    const totalTokensOutput = sum(logs, (log) => log.tokensOutput);

    return {
      period,
      totalRequests,
      totalCreditsConsumed,
      totalTokensInput,
      totalTokensOutput,
      cacheHitRate: ratio(
        logs.filter((log) => log.cacheHit).length,
        totalRequests,
      ),
      averageLatencyMs: average(logs.map((log) => log.latencyMs)),
      guardrailRejectionRate: ratio(
        logs.filter((log) => log.rejected).length,
        totalRequests,
      ),
      feedbackPositiveRate: ratio(feedbackPositive, feedbackTotal),
      topSegments,
      dailyUsage,
    };
  }

  async getSessions(
    query: AiExplainSessionsQueryDto,
  ): Promise<AiExplainSessionsResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [sessions, total] = await Promise.all([
      this.prisma.chatSession.findMany({
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          segmentIndex: true,
          updatedAt: true,
          user: { select: { email: true } },
          mediaItem: { select: { title: true } },
          _count: { select: { messages: true } },
        },
      }),
      this.prisma.chatSession.count(),
    ]);

    return {
      data: sessions.map((session) => ({
        id: session.id,
        userEmail: session.user.email,
        mediaTitle: session.mediaItem.title,
        segmentIndex: session.segmentIndex,
        messageCount: session._count.messages,
        updatedAt: session.updatedAt.toISOString(),
      })),
      total,
      page,
      limit,
    };
  }

  private buildDailyUsage(
    days: number,
    since: Date,
    logs: Array<{
      createdAt: Date;
      creditsConsumed: number;
      tokensInput: number;
      tokensOutput: number;
    }>,
  ): AiExplainDailyUsageDto[] {
    const buckets = new Map<string, AiExplainDailyUsageDto>();

    for (let index = 0; index < days; index += 1) {
      const date = toDateKey(addDays(since, index));
      buckets.set(date, { date, requests: 0, credits: 0, tokens: 0 });
    }

    for (const log of logs) {
      const key = toDateKey(log.createdAt);
      const bucket = buckets.get(key);

      if (!bucket) {
        continue;
      }

      bucket.requests += 1;
      bucket.credits += log.creditsConsumed;
      bucket.tokens += log.tokensInput + log.tokensOutput;
    }

    return [...buckets.values()];
  }
}

function sum<T>(items: T[], selector: (item: T) => number): number {
  return items.reduce((total, item) => total + selector(item), 0);
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return Math.round(sum(values, (value) => value) / values.length);
}

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) {
    return 0;
  }

  return Number((numerator / denominator).toFixed(4));
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
