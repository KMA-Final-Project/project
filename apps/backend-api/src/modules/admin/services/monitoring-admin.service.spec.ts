import { MonitoringAdminService } from './monitoring-admin.service';

describe('MonitoringAdminService', () => {
  const now = new Date();

  function createMocks() {
    const prisma = {
      mediaItem: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
    };
    const queueService = {
      getQueueOverview: jest.fn(),
      getFailedJobs: jest.fn(),
    };
    return { prisma, queueService };
  }

  describe('getQueueOverview', () => {
    it('returns queues and generatedAt', async () => {
      const { prisma, queueService } = createMocks();
      queueService.getQueueOverview.mockResolvedValue([
        {
          name: 'transcription',
          waiting: 0,
          active: 0,
          delayed: 0,
          completed: 10,
          failed: 1,
          paused: 0,
        },
        {
          name: 'ai-processing',
          waiting: 0,
          active: 0,
          delayed: 0,
          completed: 8,
          failed: 0,
          paused: 0,
        },
      ]);
      const service = new MonitoringAdminService(
        prisma as never,
        queueService as never,
      );

      const result = await service.getQueueOverview();

      expect(result.queues).toHaveLength(2);
      expect(result.generatedAt).toBeDefined();
      expect(new Date(result.generatedAt).getTime()).not.toBeNaN();
    });
  });

  describe('getFailures with source=MEDIA', () => {
    it('returns paginated media failures with summary', async () => {
      const { prisma, queueService } = createMocks();
      // Call order: count(failedMediaCount), getFailedJobs x2 (for count), findMany(availableFailCodes), count(total), findMany(items)
      prisma.mediaItem.count
        .mockResolvedValueOnce(5) // failedMediaCount
        .mockResolvedValueOnce(5); // total for pagination
      queueService.getFailedJobs.mockResolvedValue([]);
      prisma.mediaItem.findMany
        .mockResolvedValueOnce([
          { failCode: 'quotaExceeded' },
          { failCode: 'durationLimitExceeded' },
        ])
        .mockResolvedValueOnce([
          {
            id: 'media-1',
            title: 'Test',
            originType: 'LOCAL',
            status: 'FAILED',
            failCode: 'quotaExceeded',
            failReason: 'Quota exceeded',
            createdAt: now,
            updatedAt: now,
            user: { id: 'user-1', email: 'test@example.com' },
          },
        ]);
      const service = new MonitoringAdminService(
        prisma as never,
        queueService as never,
      );

      const result = await service.getFailures({
        source: 'MEDIA',
        page: 1,
        limit: 20,
      });

      expect(result.source).toBe('MEDIA');
      expect(result.summary.failedMediaCount).toBe(5);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].mediaId).toBe('media-1');
      expect(result.data[0].userEmail).toBe('test@example.com');
    });

    it('applies search filter', async () => {
      const { prisma, queueService } = createMocks();
      prisma.mediaItem.count.mockResolvedValue(0);
      queueService.getFailedJobs.mockResolvedValue([]);
      prisma.mediaItem.findMany.mockResolvedValue([]);
      const service = new MonitoringAdminService(
        prisma as never,
        queueService as never,
      );

      await service.getFailures({ source: 'MEDIA', search: 'test' });

      // Second findMany call is the actual query (first is availableFailCodes)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const whereArg = prisma.mediaItem.findMany.mock.calls[1][0].where;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(whereArg.OR).toBeDefined();
    });

    it('applies originType and failCode filters', async () => {
      const { prisma, queueService } = createMocks();
      prisma.mediaItem.count.mockResolvedValue(0);
      queueService.getFailedJobs.mockResolvedValue([]);
      prisma.mediaItem.findMany.mockResolvedValue([]);
      const service = new MonitoringAdminService(
        prisma as never,
        queueService as never,
      );

      await service.getFailures({
        source: 'MEDIA',
        originType: 'YOUTUBE',
        failCode: 'quotaExceeded',
      });

      // Second findMany call is the actual query
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const whereArg = prisma.mediaItem.findMany.mock.calls[1][0].where;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(whereArg.originType).toBe('YOUTUBE');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(whereArg.failCode).toBe('quotaExceeded');
    });
  });

  describe('getFailures with source=QUEUE', () => {
    it('returns filtered queue failures from BullMQ', async () => {
      const { prisma, queueService } = createMocks();
      prisma.mediaItem.count.mockResolvedValue(0);
      prisma.mediaItem.findMany.mockResolvedValue([]);
      // getFailedJobs call order:
      // 1. getFailedQueueJobCount -> getFailedJobs(transcription) -> []
      // 2. getFailedQueueJobCount -> getFailedJobs(ai-processing) -> []
      // 3. getQueueFailures -> getFailedJobs(undefined) -> [job]
      queueService.getFailedJobs
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            queueName: 'transcription',
            jobId: 'job-1',
            attemptsMade: 3,
            failedReason: 'timeout',
            data: { mediaId: 'm1', userId: 'u1', type: 'LOCAL' },
            finishedOn: now.getTime(),
          },
        ]);
      const service = new MonitoringAdminService(
        prisma as never,
        queueService as never,
      );

      const result = await service.getFailures({
        source: 'QUEUE',
        page: 1,
        limit: 20,
      });

      expect(result.source).toBe('QUEUE');
      expect(result.data).toHaveLength(1);
      expect(result.data[0].jobId).toBe('job-1');
      expect(result.data[0].mediaId).toBe('m1');
      expect(result.data[0].queueName).toBe('transcription');
    });

    it('applies search filter on queue failures', async () => {
      const { prisma, queueService } = createMocks();
      prisma.mediaItem.count.mockResolvedValue(0);
      prisma.mediaItem.findMany.mockResolvedValue([]);
      queueService.getFailedJobs
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            queueName: 'transcription',
            jobId: 'job-1',
            attemptsMade: 3,
            failedReason: 'timeout',
            data: {},
            finishedOn: now.getTime(),
          },
          {
            queueName: 'ai-processing',
            jobId: 'job-2',
            attemptsMade: 1,
            failedReason: 'connection refused',
            data: {},
            finishedOn: now.getTime(),
          },
        ]);
      const service = new MonitoringAdminService(
        prisma as never,
        queueService as never,
      );

      const result = await service.getFailures({
        source: 'QUEUE',
        search: 'timeout',
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].failReason).toBe('timeout');
    });
  });
});
