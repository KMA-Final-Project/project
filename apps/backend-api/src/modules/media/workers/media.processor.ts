import { Processor, Process, InjectQueue } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { Role } from 'prisma/generated/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { MinioService } from 'src/modules/minio/minio.service';
import {
  TranscriptionJobPayload,
  AiProcessingJobPayload,
  TRANSCRIPTION_QUEUE,
  AI_PROCESSING_QUEUE,
} from 'src/modules/queue/queue.types';

const execFileAsync = promisify(execFile);

// ============================================================================
// Types
// ============================================================================

/** Parsed result from ffprobe */
interface FfprobeResult {
  durationSeconds: number;
  formatName: string;
}

/** Parsed metadata from yt-dlp */
interface YtDlpMetadata {
  title: string;
  durationSeconds: number;
  /** Direct audio URL for thumbnail etc — not used for download */
  url?: string;
}

// ============================================================================
// MediaProcessor — NestJS Worker that validates & prepares media for AI Engine
// ============================================================================

/**
 * BullMQ Consumer for the `transcription` queue.
 *
 * Architecture:
 * 1. Receive job from API → update status to VALIDATING
 * 2. Validate media:
 *    - YouTube: fetch metadata via yt-dlp, check duration, download audio
 *    - Local: download from MinIO, verify with ffprobe, check duration
 * 3. Re-check quota with authoritative (real) duration
 * 4. Dispatch validated job to `ai-processing` queue for the Python AI Engine
 * 5. Update status to PROCESSING
 *
 * On failure → update status to FAILED with human-readable reason
 */
@Processor(TRANSCRIPTION_QUEUE)
export class MediaProcessor {
  private readonly logger = new Logger(MediaProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly minioService: MinioService,
    @InjectQueue(AI_PROCESSING_QUEUE)
    private readonly aiQueue: Queue,
  ) {}

  @Process('process')
  async handleTranscription(job: Job<TranscriptionJobPayload>): Promise<void> {
    const { mediaId, type, filePath, url, userId } = job.data;

    this.logger.log(
      `[Job ${job.id}] Starting validation | type: ${type} | media: ${mediaId}`,
    );

    try {
      // Step 1: Mark as VALIDATING
      await this.updateMedia(mediaId, { status: 'VALIDATING' });

      // Step 2: Validate and prepare audio
      let audioS3Key: string;
      let durationSeconds: number;
      let title: string | undefined;

      if (type === 'YOUTUBE') {
        const result = await this.handleYoutube(
          mediaId,
          userId,
          url ?? '',
          job.id?.toString() ?? 'unknown',
        );
        audioS3Key = result.audioS3Key;
        durationSeconds = result.durationSeconds;
        title = result.title;
      } else {
        const result = await this.handleLocal(
          mediaId,
          userId,
          filePath ?? '',
          job.id?.toString() ?? 'unknown',
        );
        audioS3Key = result.audioS3Key;
        durationSeconds = result.durationSeconds;
      }

      // Step 3: Update MediaItem with real duration (and title for YouTube)
      const updateData: Record<string, unknown> = {
        durationSeconds,
        audioS3Key,
      };
      if (title) updateData.title = title;
      await this.updateMedia(mediaId, updateData);

      // Step 4: Authoritative quota re-check with real duration
      await this.assertQuotaWithDuration(userId, durationSeconds, mediaId);

      // Step 5: Dispatch to AI Engine queue
      const aiPayload: AiProcessingJobPayload = {
        mediaId,
        audioS3Key,
        durationSeconds,
        userId,
        targetLanguage: job.data.targetLanguage,
      };

      const aiJob = await this.aiQueue.add('process', aiPayload, {
        attempts: 2,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      });

      // Step 6: Mark as PROCESSING (AI Engine will take over)
      await this.updateMedia(mediaId, { status: 'PROCESSING' });

      this.logger.log(
        `[Job ${job.id}] Validated & dispatched to AI queue (aiJob: ${aiJob.id}) | ` +
          `duration: ${durationSeconds}s`,
      );
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'Unknown validation error';

      await this.updateMedia(mediaId, {
        status: 'FAILED',
        failReason: reason,
      });

      this.logger.error(`[Job ${job.id}] FAILED: ${reason}`);

      // Don't re-throw validation errors — they're permanent failures, not retryable
      // (e.g., duration exceeds limit, invalid format, non-audio file)
      // BullMQ would just retry and fail again. Mark as FAILED and move on.
    }
  }

  // ==========================================================================
  // YouTube Flow
  // ==========================================================================

  /**
   * 1. Fetch metadata (yt-dlp --dump-json)
   * 2. Check duration against subscription limit
   * 3. Download audio (yt-dlp -x --audio-format mp3)
   * 4. Upload downloaded audio to MinIO
   */
  private async handleYoutube(
    mediaId: string,
    userId: string,
    url: string,
    jobId: string,
  ): Promise<{
    audioS3Key: string;
    durationSeconds: number;
    title: string;
  }> {
    // 1. Fetch metadata
    this.logger.log(`[Job ${jobId}] Fetching YouTube metadata: ${url}`);
    const metadata = await this.fetchYoutubeMetadata(url);

    this.logger.log(
      `[Job ${jobId}] YouTube → "${metadata.title}" (${metadata.durationSeconds}s)`,
    );

    // 2. Check per-file duration limit
    await this.assertDurationWithinLimit(userId, metadata.durationSeconds);

    // 3. Download audio to temp
    const tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'bilingual-yt-'),
    );
    const outputTemplate = path.join(tempDir, '%(id)s.%(ext)s');

    try {
      this.logger.log(`[Job ${jobId}] Downloading YouTube audio...`);
      const { stdout } = await execFileAsync(
        'yt-dlp',
        [
          '-x', // Extract audio only
          '--audio-format',
          'mp3',
          '--audio-quality',
          '5', // Medium quality (saves bandwidth)
          '-o',
          outputTemplate,
          '--print',
          'after_move:filepath', // Print actual output path
          '--no-playlist',
          '--no-warnings',
          url,
        ],
        { timeout: 300_000 }, // 5 min download timeout
      );

      // yt-dlp prints the final filepath
      const downloadedFile = stdout.trim().split('\n').pop()?.trim();
      if (!downloadedFile || !fs.existsSync(downloadedFile)) {
        throw new Error('yt-dlp did not produce an output file');
      }

      // 4. Upload to MinIO
      const s3Key = `audio/${userId}/${mediaId}/youtube-audio.mp3`;
      await this.minioService.uploadFile(s3Key, downloadedFile);

      this.logger.log(
        `[Job ${jobId}] YouTube audio uploaded to MinIO: ${s3Key}`,
      );

      return {
        audioS3Key: s3Key,
        durationSeconds: Math.round(metadata.durationSeconds),
        title: metadata.title,
      };
    } finally {
      // Clean up temp directory
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * Fetch YouTube video metadata without downloading.
   */
  private async fetchYoutubeMetadata(url: string): Promise<YtDlpMetadata> {
    try {
      const { stdout } = await execFileAsync(
        'yt-dlp',
        ['--dump-json', '--no-playlist', '--no-warnings', url],
        { timeout: 30_000 },
      );

      const data = JSON.parse(stdout) as {
        title: string;
        duration: number;
        url?: string;
      };

      return {
        title: data.title,
        durationSeconds: data.duration,
        url: data.url,
      };
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Failed to fetch metadata';
      throw new Error(`YouTube metadata fetch failed: ${msg}`);
    }
  }

  // ==========================================================================
  // Local File Flow
  // ==========================================================================

  /**
   * 1. Download file from MinIO to temp
   * 2. Verify it's an audio file using ffprobe
   * 3. Get duration
   * 4. Check duration against subscription limit
   */
  private async handleLocal(
    mediaId: string,
    userId: string,
    objectKey: string,
    jobId: string,
  ): Promise<{ audioS3Key: string; durationSeconds: number }> {
    // 1. Download from MinIO to temp
    const tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'bilingual-local-'),
    );
    const ext = path.extname(objectKey) || '.audio';
    const localPath = path.join(tempDir, `input${ext}`);

    try {
      this.logger.log(`[Job ${jobId}] Downloading from MinIO: ${objectKey}`);
      await this.minioService.downloadObject(objectKey, localPath);

      // 2. Verify with ffprobe
      this.logger.log(`[Job ${jobId}] Verifying audio format with ffprobe...`);
      const probeResult = await this.probeAudioFile(localPath);

      this.logger.log(
        `[Job ${jobId}] ffprobe → format: ${probeResult.formatName}, ` +
          `duration: ${probeResult.durationSeconds}s`,
      );

      // 3. Check per-file duration limit
      await this.assertDurationWithinLimit(userId, probeResult.durationSeconds);

      return {
        audioS3Key: objectKey, // Already in MinIO, no re-upload needed
        durationSeconds: Math.round(probeResult.durationSeconds),
      };
    } finally {
      // Clean up temp directory
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * Use ffprobe to verify the file is audio and get its duration.
   * Throws with a clear message if the file is not a valid audio file.
   */
  private async probeAudioFile(filePath: string): Promise<FfprobeResult> {
    try {
      const { stdout } = await execFileAsync(
        'ffprobe',
        [
          '-v',
          'error',
          '-show_entries',
          'format=duration,format_name',
          '-of',
          'json',
          filePath,
        ],
        { timeout: 30_000 },
      );

      const data = JSON.parse(stdout) as {
        format?: { duration?: string; format_name?: string };
      };

      if (!data.format?.duration) {
        throw new Error('ffprobe could not determine duration');
      }

      const duration = parseFloat(data.format.duration);
      if (isNaN(duration) || duration <= 0) {
        throw new Error(
          'Invalid duration — file may not be a valid audio file',
        );
      }

      // Basic audio format validation
      const formatName = data.format.format_name ?? '';
      const audioFormats = [
        'mp3',
        'wav',
        'flac',
        'ogg',
        'aac',
        'mp4',
        'm4a',
        'webm',
        'matroska',
        'mov',
        'mpeg',
        'mpegts',
      ];
      const isAudio = audioFormats.some((f) => formatName.includes(f));

      if (!isAudio) {
        throw new Error(
          `Unsupported format "${formatName}" — only audio files are accepted`,
        );
      }

      return { durationSeconds: duration, formatName };
    } catch (error) {
      if (error instanceof Error && error.message.includes('ENOENT')) {
        throw new Error(
          'ffprobe not found — please install FFmpeg on the system',
        );
      }
      throw error instanceof Error
        ? error
        : new Error('ffprobe verification failed');
    }
  }

  // ==========================================================================
  // Quota & Subscription Checks
  // ==========================================================================

  /**
   * Check that the file duration does not exceed the per-file limit
   * from the user's current subscription snapshot.
   */
  private async assertDurationWithinLimit(
    userId: string,
    durationSeconds: number,
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        role: true,
        currentSubscription: {
          select: { maxDurationPerFileSnapshot: true },
        },
      },
    });

    if (user.role === Role.ADMIN) {
      return;
    }

    if (!user.currentSubscription) {
      throw new Error('No active subscription — cannot process media');
    }

    const limit = user.currentSubscription.maxDurationPerFileSnapshot;
    if (durationSeconds > limit) {
      const limitMin = Math.round(limit / 60);
      const fileMin = Math.round(durationSeconds / 60);
      throw new Error(
        `File duration (${fileMin} min) exceeds your plan limit (${limitMin} min per file)`,
      );
    }
  }

  /**
   * Authoritative monthly quota check using the real file duration.
   * This is the final gate before dispatching to AI — catches cases where
   * the optimistic check at upload time was stale.
   */
  private async assertQuotaWithDuration(
    userId: string,
    durationSeconds: number,
    mediaId: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        role: true,
        currentSubscription: {
          select: { monthlyQuotaSecondsSnapshot: true },
        },
      },
    });

    if (user.role === Role.ADMIN) {
      return;
    }

    if (!user.currentSubscription) {
      throw new Error('No active subscription');
    }

    const quota = user.currentSubscription.monthlyQuotaSecondsSnapshot;

    // Calculate current month usage (excluding this media item)
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const usageResult = await this.prisma.mediaItem.aggregate({
      where: {
        userId,
        countedInQuota: true,
        createdAt: { gte: monthStart },
        deletedAt: null,
        id: { not: mediaId }, // Exclude current item
      },
      _sum: { durationSeconds: true },
    });

    const usedSeconds = usageResult._sum.durationSeconds || 0;
    const totalAfter = usedSeconds + durationSeconds;

    if (totalAfter > quota) {
      const remaining = Math.max(0, quota - usedSeconds);
      throw new Error(
        `Monthly quota would be exceeded. Used: ${Math.round(usedSeconds / 60)} min, ` +
          `This file: ${Math.round(durationSeconds / 60)} min, ` +
          `Remaining: ${Math.round(remaining / 60)} min`,
      );
    }
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Update the MediaItem in the database.
   */
  private async updateMedia(
    mediaId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.mediaItem.update({
      where: { id: mediaId },
      data,
    });
  }
}
