import { Injectable } from '@nestjs/common';
import { MediaStatus, SubscriptionStatus } from 'prisma/generated/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueueService } from 'src/modules/queue/queue.service';

import type { AdminOverviewDto } from '../dto/overview.dto';

@Injectable()
export class OverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  async getOverview(): Promise<AdminOverviewDto> {
    const [
      totalUsers,
      activeSubscriptions,
      processedMedia,
      failedMedia,
      processingMedia,
      queues,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.subscription.count({
        where: { status: SubscriptionStatus.ACTIVE },
      }),
      this.prisma.mediaItem.count({
        where: {
          deletedAt: null,
          status: MediaStatus.COMPLETED,
        },
      }),
      this.prisma.mediaItem.count({
        where: {
          deletedAt: null,
          status: MediaStatus.FAILED,
        },
      }),
      this.prisma.mediaItem.count({
        where: {
          deletedAt: null,
          status: MediaStatus.PROCESSING,
        },
      }),
      this.queueService.getQueueOverview(),
    ]);

    return {
      totalUsers,
      activeSubscriptions,
      processedMedia,
      failedMedia,
      processingMedia,
      queues,
    };
  }
}
