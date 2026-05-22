import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bullmq';
import {
  AI_PROCESSING_QUEUE,
  TranscriptionJobPayload,
  TRANSCRIPTION_QUEUE,
} from './queue.types';

/**
 * Queue Producer service — dispatches transcription jobs to Redis via BullMQ.
 *
 * This service follows the Dependency Inversion Principle:
 * - The MediaService depends on this abstraction (QueueService)
 * - The actual queue implementation (BullMQ/Redis) is an infrastructure detail
 *
 * The Python AI Worker will consume these jobs on the other end.
 */
@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue(TRANSCRIPTION_QUEUE)
    private readonly transcriptionQueue: Queue,
    @InjectQueue(AI_PROCESSING_QUEUE)
    private readonly aiProcessingQueue: Queue,
  ) {}

  /**
   * Dispatch a media item for transcription processing.
   *
   * @param payload - Standardized job data (mediaId, type, filePath/url, userId)
   * @returns The BullMQ job ID for tracking
   */
  async dispatchTranscriptionJob(
    payload: TranscriptionJobPayload,
  ): Promise<string> {
    const job = await this.transcriptionQueue.add('process', payload, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: { count: 100 }, // Keep last 100 completed jobs
      removeOnFail: { count: 500 }, // Keep last 500 failed jobs for debugging
    });

    this.logger.log(
      `Dispatched ${payload.type} job for media ${payload.mediaId} (jobId: ${job.id})`,
    );

    return job.id!;
  }

  async getQueueOverview() {
    const [transcription, aiProcessing] = await Promise.all([
      this.getQueueMetrics(this.transcriptionQueue, TRANSCRIPTION_QUEUE),
      this.getQueueMetrics(this.aiProcessingQueue, AI_PROCESSING_QUEUE),
    ]);

    return [transcription, aiProcessing];
  }

  private async getQueueMetrics(queue: Queue, name: string) {
    const counts = await queue.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed',
      'paused',
    );

    return {
      name,
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      delayed: counts.delayed ?? 0,
      paused: counts.paused ?? 0,
    };
  }
}
