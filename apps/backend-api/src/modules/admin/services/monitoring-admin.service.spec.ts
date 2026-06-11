import { MonitoringAdminService } from './monitoring-admin.service';

describe('MonitoringAdminService', () => {
  const now = new Date('2026-06-11T03:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

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
    const minioService = {
      readProcessedJson: jest.fn(),
    };
    return { prisma, queueService, minioService };
  }

  function makeCompletedMediaRow(
    id: string,
    sourceLanguage = 'zh',
    targetLanguage = 'vi',
    email = 'user@example.com',
    updatedAt = now,
  ) {
    return {
      id,
      title: `Media ${id}`,
      sourceLanguage,
      targetLanguage,
      durationSeconds: 367,
      updatedAt,
      user: {
        email,
      },
    };
  }

  function makeFinalArtifact({
    provider = 'openai',
    model = 'gpt-4.1-mini',
    profile = 'dense_dialogue_cjk',
    totalCostUsd = 0.0042644,
    totalPromptTokens = 4629,
    totalCompletionTokens = 1508,
    totalTokens = 6137,
    coverageSegments = 62,
    fallbackSegments = 0,
    attemptedWindows = 5,
    completedWindows = 5,
    failedWindows = 0,
    timedOutWindows = 0,
    invalidWindows = 0,
    deadlineHit = false,
    sourceLanguage = 'zh',
    targetLanguage = 'vi',
    duration = 367,
    totalSegmentCount = 62,
  } = {}) {
    return {
      metadata: {
        duration,
        engine_profile: 'HIGH',
        source_lang: sourceLanguage,
        target_lang: targetLanguage,
        model_used: 'iic/SenseVoiceSmall',
        translation_finalization: {
          enabled: true,
          applied_profile: profile,
          provider,
          model,
          coverage_segments: coverageSegments,
          coverage_duration_seconds: 255.6,
          attempted_windows: attemptedWindows,
          completed_windows: completedWindows,
          timed_out_windows: timedOutWindows,
          invalid_windows: invalidWindows,
          failed_windows: failedWindows,
          fallback_segments: fallbackSegments,
          total_prompt_tokens: totalPromptTokens,
          total_completion_tokens: totalCompletionTokens,
          total_tokens: totalTokens,
          total_cost_usd: totalCostUsd,
          finalization_deadline_hit: deadlineHit,
          segment_provenance: Array.from(
            { length: totalSegmentCount },
            (_, i) => ({
              segment_index: i,
              source:
                i >= totalSegmentCount - fallbackSegments
                  ? 'nmt'
                  : 'llm_revision',
              revision_index:
                i >= totalSegmentCount - fallbackSegments
                  ? null
                  : Math.floor(i / 12),
            }),
          ),
        },
      },
      segments: Array.from({ length: totalSegmentCount }, (_, i) => ({
        text: `Source ${i}`,
        start: i,
        end: i + 1,
        words: [],
        translation: `Translation ${i}`,
        phonetic: '',
        detected_lang: sourceLanguage,
        segment_index: i,
      })),
    };
  }

  describe('getQueueOverview', () => {
    it('returns queues and generatedAt', async () => {
      const { prisma, queueService, minioService } = createMocks();
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
        minioService as never,
      );

      const result = await service.getQueueOverview();

      expect(result.queues).toHaveLength(2);
      expect(result.generatedAt).toBeDefined();
      expect(new Date(result.generatedAt).getTime()).not.toBeNaN();
    });
  });

  describe('getFailures with source=MEDIA', () => {
    it('returns paginated media failures with summary', async () => {
      const { prisma, queueService, minioService } = createMocks();
      prisma.mediaItem.count.mockResolvedValueOnce(5).mockResolvedValueOnce(5);
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
        minioService as never,
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
  });

  describe('getFailures with source=QUEUE', () => {
    it('returns filtered queue failures from BullMQ', async () => {
      const { prisma, queueService, minioService } = createMocks();
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
            data: { mediaId: 'm1', userId: 'u1', type: 'LOCAL' },
            finishedOn: now.getTime(),
          },
        ]);
      const service = new MonitoringAdminService(
        prisma as never,
        queueService as never,
        minioService as never,
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
  });

  describe('getTranslationFinalizationSummary', () => {
    it('aggregates totals and provider breakdowns from finalized media', async () => {
      const { prisma, queueService, minioService } = createMocks();
      prisma.mediaItem.findMany.mockResolvedValue([
        makeCompletedMediaRow('m1', 'zh', 'vi', 'zh@example.com'),
        makeCompletedMediaRow('m2', 'en', 'vi', 'en@example.com'),
      ]);
      minioService.readProcessedJson
        .mockResolvedValueOnce(
          makeFinalArtifact({
            sourceLanguage: 'zh',
            targetLanguage: 'vi',
            totalCostUsd: 0.004,
            totalTokens: 6000,
            coverageSegments: 62,
          }),
        )
        .mockResolvedValueOnce(
          makeFinalArtifact({
            sourceLanguage: 'en',
            targetLanguage: 'vi',
            profile: 'dense_dialogue_general',
            totalCostUsd: 0.008,
            totalTokens: 11025,
            totalPromptTokens: 8065,
            totalCompletionTokens: 2960,
          }),
        );

      const service = new MonitoringAdminService(
        prisma as never,
        queueService as never,
        minioService as never,
      );

      const result = await service.getTranslationFinalizationSummary({
        period: '7d',
      });

      expect(result.totals.completedMedia).toBe(2);
      expect(result.totals.finalizedMedia).toBe(2);
      expect(result.totals.totalCostUsd).toBeCloseTo(0.012, 6);
      expect(result.totals.totalTokens).toBe(17025);
      expect(result.breakdowns.byProvider).toEqual([
        {
          provider: 'openai',
          mediaCount: 2,
          totalCostUsd: 0.012,
          totalTokens: 17025,
        },
      ]);
      expect(result.breakdowns.byRoute).toHaveLength(2);
    });

    it('filters summary results by provider and profile', async () => {
      const { prisma, queueService, minioService } = createMocks();
      prisma.mediaItem.findMany.mockResolvedValue([
        makeCompletedMediaRow('m1'),
        makeCompletedMediaRow('m2', 'en', 'vi'),
      ]);
      minioService.readProcessedJson
        .mockResolvedValueOnce(
          makeFinalArtifact({
            provider: 'openai',
            profile: 'dense_dialogue_cjk',
            totalCostUsd: 0.004,
          }),
        )
        .mockResolvedValueOnce(
          makeFinalArtifact({
            provider: 'openai',
            profile: 'dense_dialogue_general',
            sourceLanguage: 'en',
            totalCostUsd: 0.008,
          }),
        );

      const service = new MonitoringAdminService(
        prisma as never,
        queueService as never,
        minioService as never,
      );

      const result = await service.getTranslationFinalizationSummary({
        period: '7d',
        profile: 'dense_dialogue_cjk',
      });

      expect(result.totals.finalizedMedia).toBe(1);
      expect(result.totals.totalCostUsd).toBeCloseTo(0.004, 6);
      expect(result.breakdowns.byProfile[0]?.profile).toBe(
        'dense_dialogue_cjk',
      );
    });
  });

  describe('getTranslationFinalizationMedia', () => {
    it('returns paginated recent media rows with derived provenance counts', async () => {
      const { prisma, queueService, minioService } = createMocks();
      prisma.mediaItem.findMany.mockResolvedValue([
        makeCompletedMediaRow('m1'),
        makeCompletedMediaRow('m2', 'en', 'vi', 'en@example.com'),
      ]);
      minioService.readProcessedJson
        .mockResolvedValueOnce(
          makeFinalArtifact({
            totalCostUsd: 0.0042644,
            totalSegmentCount: 62,
            fallbackSegments: 0,
          }),
        )
        .mockResolvedValueOnce(
          makeFinalArtifact({
            sourceLanguage: 'en',
            profile: 'dense_dialogue_general',
            fallbackSegments: 5,
            failedWindows: 1,
            timedOutWindows: 1,
            totalSegmentCount: 40,
          }),
        );

      const service = new MonitoringAdminService(
        prisma as never,
        queueService as never,
        minioService as never,
      );

      const result = await service.getTranslationFinalizationMedia({
        period: '7d',
        page: 1,
        limit: 20,
      });

      expect(result.total).toBe(2);
      expect(result.data[0]).toMatchObject({
        mediaId: 'm1',
        provider: 'openai',
        profile: 'dense_dialogue_cjk',
        llmRevisedSegments: 62,
        nmtFallbackSegments: 0,
      });
      expect(result.data[1]).toMatchObject({
        mediaId: 'm2',
        profile: 'dense_dialogue_general',
        fallbackSegments: 5,
        failedWindows: 1,
        timedOutWindows: 1,
        nmtFallbackSegments: 5,
      });
    });

    it('filters media rows by health state', async () => {
      const { prisma, queueService, minioService } = createMocks();
      prisma.mediaItem.findMany.mockResolvedValue([
        makeCompletedMediaRow('healthy'),
        makeCompletedMediaRow('fallback'),
        makeCompletedMediaRow('deadline'),
      ]);
      minioService.readProcessedJson.mockImplementation((objectKey: string) => {
        if (objectKey.startsWith('healthy/')) {
          return makeFinalArtifact();
        }
        if (objectKey.startsWith('fallback/')) {
          return makeFinalArtifact({ fallbackSegments: 3 });
        }
        if (objectKey.startsWith('deadline/')) {
          return makeFinalArtifact({ deadlineHit: true });
        }
        return makeFinalArtifact();
      });

      const service = new MonitoringAdminService(
        prisma as never,
        queueService as never,
        minioService as never,
      );

      const fallbackOnly = await service.getTranslationFinalizationMedia({
        period: '7d',
        health: 'fallback',
      });
      const deadlineOnly = await service.getTranslationFinalizationMedia({
        period: '7d',
        health: 'deadline_hit',
      });

      expect(fallbackOnly.total).toBe(1);
      expect(fallbackOnly.data[0]?.mediaId).toBe('fallback');
      expect(deadlineOnly.total).toBe(1);
      expect(deadlineOnly.data[0]?.mediaId).toBe('deadline');
    });

    it('skips unreadable final artifacts without failing the response', async () => {
      const { prisma, queueService, minioService } = createMocks();
      prisma.mediaItem.findMany.mockResolvedValue([
        makeCompletedMediaRow('m1'),
      ]);
      minioService.readProcessedJson.mockRejectedValue(
        new Error('missing final'),
      );

      const service = new MonitoringAdminService(
        prisma as never,
        queueService as never,
        minioService as never,
      );

      const result = await service.getTranslationFinalizationMedia({
        period: '7d',
      });

      expect(result.total).toBe(0);
      expect(result.data).toEqual([]);
    });
  });
});
