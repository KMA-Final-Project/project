import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { spawn } from 'child_process';
import * as path from 'path';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  TranscriptionJobPayload,
  TRANSCRIPTION_QUEUE,
} from 'src/modules/queue/queue.types';

/**
 * BullMQ Consumer for the transcription queue.
 *
 * Architecture: Node-Python Hybrid
 * - Node.js (this class) = The Manager: handles job lifecycle, DB updates, error handling
 * - Python (child process) = The Specialist: handles actual media processing
 *
 * Flow:
 * 1. Receive job → update DB to PROCESSING
 * 2. Spawn Python script as a child process
 * 3. Stream Python stdout/stderr with prefixed logging
 * 4. On success → update DB to COMPLETED
 * 5. On failure → update DB to FAILED → throw (BullMQ retries)
 */
@Processor(TRANSCRIPTION_QUEUE)
export class MediaProcessor {
  private readonly logger = new Logger(MediaProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  @Process('process')
  async handleTranscription(job: Job<TranscriptionJobPayload>): Promise<void> {
    const { mediaId, type, filePath, url, userId } = job.data;

    this.logger.log(
      `Processing job ${job.id} | type: ${type} | media: ${mediaId} | user: ${userId}`,
    );

    try {
      // Step 1: Mark as PROCESSING
      await this.updateMediaStatus(mediaId, 'PROCESSING');

      // Step 2: Determine input for the Python script
      const inputSource = type === 'LOCAL' ? (filePath ?? '') : (url ?? '');

      // Step 3: Execute Python processing
      await this.executePython(
        job.id?.toString() ?? 'unknown',
        inputSource,
        mediaId,
      );

      // Step 4: Mark as COMPLETED
      await this.updateMediaStatus(mediaId, 'COMPLETED');

      this.logger.log(
        `Job ${job.id} completed successfully for media ${mediaId}`,
      );
    } catch (error) {
      // Step 5: Mark as FAILED and re-throw for BullMQ retry
      await this.updateMediaStatus(mediaId, 'FAILED');

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      this.logger.error(
        `Job ${job.id} failed for media ${mediaId}: ${errorMessage}`,
      );

      throw error; // BullMQ will retry based on job options
    }
  }

  /**
   * Spawn a Python child process and stream its output.
   *
   * Resolves when Python exits with code 0.
   * Rejects with an error if Python exits with a non-zero code or fails to spawn.
   */
  private executePython(
    jobId: string,
    inputSource: string,
    mediaId: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Resolve script path relative to compiled JS output (dist/)
      const scriptPath = path.resolve(
        __dirname,
        'modules',
        'media',
        'scripts',
        'mock_processor.py',
      );

      const pythonProcess = spawn('python', [
        scriptPath,
        '--input',
        inputSource,
        '--media-id',
        mediaId,
        '--job-id',
        jobId,
      ]);

      // Prefix stdout logs from Python
      pythonProcess.stdout.on('data', (data: Buffer) => {
        const lines = data.toString().trim().split('\n');
        for (const line of lines) {
          this.logger.log(`[Python:${jobId}] ${line}`);
        }
      });

      // Prefix stderr logs from Python
      pythonProcess.stderr.on('data', (data: Buffer) => {
        const lines = data.toString().trim().split('\n');
        for (const line of lines) {
          this.logger.error(`[Python:${jobId}] ${line}`);
        }
      });

      // Handle spawn errors (e.g., Python not found)
      pythonProcess.on('error', (err) => {
        reject(new Error(`Failed to spawn Python process: ${err.message}`));
      });

      // Handle process exit
      pythonProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              `Python process exited with code ${code} (job: ${jobId})`,
            ),
          );
        }
      });
    });
  }

  /**
   * Update the MediaItem status in the database.
   */
  private async updateMediaStatus(
    mediaId: string,
    status: 'PROCESSING' | 'COMPLETED' | 'FAILED',
  ): Promise<void> {
    await this.prisma.mediaItem.update({
      where: { id: mediaId },
      data: { status },
    });
  }
}
