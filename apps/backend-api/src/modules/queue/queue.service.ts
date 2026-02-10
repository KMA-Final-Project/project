import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bullmq';
import { TranscriptionJobPayload, TRANSCRIPTION_QUEUE } from './queue.types';

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
}
