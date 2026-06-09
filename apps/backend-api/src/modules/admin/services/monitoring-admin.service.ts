import { Injectable } from '@nestjs/common';
import { MediaStatus } from 'prisma/generated/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueueService } from 'src/modules/queue/queue.service';
import {
  TRANSCRIPTION_QUEUE,
  AI_PROCESSING_QUEUE,
} from 'src/modules/queue/queue.types';

import type {
  AdminMonitoringQueueOverview,
  AdminMonitoringFailuresQuery,
  AdminMonitoringFailuresResponse,
  AdminMonitoringFailureItem,
} from '@kapter/contracts';

@Injectable()
export class MonitoringAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
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

    const summary = {
      failedMediaCount,
      failedQueueJobCount,
      availableFailCodes,
    };

    if (source === 'MEDIA') {
      return this.getMediaFailures(query, summary, page, limit);
    }

    return this.getQueueFailures(query, summary, page, limit);
  }

  private async getMediaFailures(
    query: AdminMonitoringFailuresQuery,
    summary: {
      failedMediaCount: number;
      failedQueueJobCount: number;
      availableFailCodes: string[];
    },
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
    summary: {
      failedMediaCount: number;
      failedQueueJobCount: number;
      availableFailCodes: string[];
    },
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

  private endOfDay(dateStr: string): Date {
    const d = new Date(dateStr);
    d.setHours(23, 59, 59, 999);
    return d;
  }
}
