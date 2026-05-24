import { AiExplainAdminService } from './ai-explain-admin.service';

describe('AiExplainAdminService', () => {
  it('computes metrics from usage logs, feedback, and grouped segments', async () => {
    const now = new Date();
    const prisma = {
      aiUsageLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            mediaId: 'media-1',
            segmentIndex: 2,
            segmentText: 'Hello there',
            creditsConsumed: 1,
            tokensInput: 10,
            tokensOutput: 20,
            latencyMs: 1000,
            cacheHit: false,
            rejected: false,
            createdAt: now,
          },
          {
            mediaId: 'media-1',
            segmentIndex: 2,
            segmentText: 'Hello there',
            creditsConsumed: 0,
            tokensInput: 0,
            tokensOutput: 0,
            latencyMs: 0,
            cacheHit: true,
            rejected: false,
            createdAt: now,
          },
        ]),
        groupBy: jest.fn().mockResolvedValue([
          {
            mediaId: 'media-1',
            segmentIndex: 2,
            _count: { _all: 2 },
          },
        ]),
      },
      chatFeedback: {
        count: jest.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(1),
      },
      mediaItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'media-1',
            title: 'Demo media',
          },
        ]),
      },
    };
    const service = new AiExplainAdminService(prisma as never);

    const metrics = await service.getMetrics({ period: '7d' });

    expect(metrics.totalRequests).toBe(2);
    expect(metrics.totalCreditsConsumed).toBe(1);
    expect(metrics.cacheHitRate).toBe(0.5);
    expect(metrics.feedbackPositiveRate).toBe(0.5);
    expect(metrics.topSegments).toEqual([
      {
        mediaId: 'media-1',
        mediaTitle: 'Demo media',
        segmentIndex: 2,
        segmentText: 'Hello there',
        requestCount: 2,
      },
    ]);
  });
});
