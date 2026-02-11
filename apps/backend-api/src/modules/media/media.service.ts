import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { MinioService } from 'src/modules/minio/minio.service';
import { QueueService } from 'src/modules/queue/queue.service';
import { MEDIA_ERRORS } from 'src/common/constants/error-messages';
import {
  RequestPresignedUrlDto,
  ConfirmUploadDto,
  SubmitYoutubeDto,
} from './dto';
import type {
  PresignedUrlResponseDto,
  ConfirmUploadResponseDto,
  SubmitYoutubeResponseDto,
} from './dto';
import { randomUUID } from 'crypto';
import { MediaOriginType, ProcessingMode } from 'prisma/generated/enums';

/** Presigned URL validity: 1 hour */
const PRESIGNED_URL_EXPIRY_SECONDS = 3600;

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly minioService: MinioService,
    private readonly queueService: QueueService,
  ) {}

  // ==================== PRESIGNED URL FLOW ====================

  /**
   * Step 1: Generate a presigned PUT URL for direct client upload.
   *
   * - Checks whether the user has remaining monthly quota
   * - Generates a unique S3 key under audio/{userId}/{uuid}/{fileName}
   * - Returns the public-facing presigned URL + key for the confirm step
   */
  async requestPresignedUrl(
    userId: string,
    dto: RequestPresignedUrlDto,
  ): Promise<PresignedUrlResponseDto> {
    // Optimistic quota check — we don't know the duration yet,
    // but we prevent obviously-exceeded users from even uploading.
    await this.assertQuotaNotExceeded(userId);

    // Generate unique object key
    const objectKey = `audio/${userId}/${randomUUID()}/${dto.fileName}`;

    const uploadUrl = await this.minioService.generatePresignedPutUrl(
      objectKey,
      PRESIGNED_URL_EXPIRY_SECONDS,
    );

    this.logger.log(`Presigned URL generated for user ${userId}: ${objectKey}`);

    return {
      uploadUrl,
      objectKey,
      expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
    };
  }

  /**
   * Step 2: Confirm that the file was uploaded and enqueue for processing.
   *
   * - Verifies the object exists in MinIO (statObject)
   * - Creates a MediaItem record with status QUEUED
   * - Dispatches a transcription job to BullMQ
   */
  async confirmUpload(
    userId: string,
    dto: ConfirmUploadDto,
  ): Promise<ConfirmUploadResponseDto> {
    // Verify the file actually landed in MinIO
    const exists = await this.minioService.verifyObjectExists(dto.objectKey);
    if (!exists) {
      throw new BadRequestException(MEDIA_ERRORS.FILE_NOT_FOUND);
    }

    // Create DB record + dispatch job
    const mediaItem = await this.prisma.mediaItem.create({
      data: {
        userId,
        title: dto.title,
        originType: MediaOriginType.LOCAL,
        audioS3Key: dto.objectKey,
        processingMode:
          dto.processingMode === 'TRANSCRIBE_TRANSLATE'
            ? ProcessingMode.TRANSCRIBE_TRANSLATE
            : ProcessingMode.TRANSCRIBE,
        status: 'QUEUED',
      },
    });

    const jobId = await this.queueService.dispatchTranscriptionJob({
      mediaId: mediaItem.id,
      type: MediaOriginType.LOCAL,
      filePath: dto.objectKey,
      userId,
      processingMode: dto.processingMode ?? 'TRANSCRIBE',
    });

    this.logger.log(`Upload confirmed: media ${mediaItem.id}, job ${jobId}`);

    return {
      id: mediaItem.id,
      title: mediaItem.title,
      status: mediaItem.status,
      jobId,
    };
  }

  // ==================== YOUTUBE FLOW ====================

  /**
   * Submit a YouTube URL for async download + transcription.
   *
   * - Creates a MediaItem record with status QUEUED and a placeholder S3 key
   * - Dispatches a transcription job (the worker will download + process)
   */
  async submitYoutube(
    userId: string,
    dto: SubmitYoutubeDto,
  ): Promise<SubmitYoutubeResponseDto> {
    // Optimistic quota check
    await this.assertQuotaNotExceeded(userId);

    // Placeholder S3 key — the worker will populate the real path after download
    const placeholderKey = `audio/${userId}/${randomUUID()}/youtube-pending`;

    const title = dto.title || this.extractYoutubeTitle(dto.url);

    const mediaItem = await this.prisma.mediaItem.create({
      data: {
        userId,
        title,
        originType: MediaOriginType.YOUTUBE,
        originUrl: dto.url,
        audioS3Key: placeholderKey,
        processingMode:
          dto.processingMode === 'TRANSCRIBE_TRANSLATE'
            ? ProcessingMode.TRANSCRIBE_TRANSLATE
            : ProcessingMode.TRANSCRIBE,
        status: 'QUEUED',
      },
    });

    const jobId = await this.queueService.dispatchTranscriptionJob({
      mediaId: mediaItem.id,
      type: MediaOriginType.YOUTUBE,
      url: dto.url,
      userId,
      processingMode: dto.processingMode ?? 'TRANSCRIBE',
    });

    this.logger.log(`YouTube submitted: media ${mediaItem.id}, job ${jobId}`);

    return {
      id: mediaItem.id,
      title: mediaItem.title,
      status: mediaItem.status,
      originUrl: mediaItem.originUrl,
      jobId,
    };
  }

  // ==================== PRIVATE HELPERS ====================

  /**
   * Check if the user has exceeded their monthly transcription quota.
   * Throws BadRequestException if quota is fully used.
   *
   * This is an optimistic check — we don't know the exact duration of the
   * new file, but we prevent users who have already maxed out from uploading.
   */
  private async assertQuotaNotExceeded(userId: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        currentSubscription: {
          select: {
            monthlyQuotaSecondsSnapshot: true,
          },
        },
      },
    });

    // If no active subscription, deny
    if (!user.currentSubscription) {
      throw new BadRequestException(MEDIA_ERRORS.QUOTA_EXCEEDED);
    }

    const quota = user.currentSubscription.monthlyQuotaSecondsSnapshot;

    // Calculate current month usage
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const usageResult = await this.prisma.mediaItem.aggregate({
      where: {
        userId,
        countedInQuota: true,
        createdAt: { gte: monthStart },
        deletedAt: null,
      },
      _sum: { durationSeconds: true },
    });

    const usedSeconds = usageResult._sum.durationSeconds || 0;

    if (usedSeconds >= quota) {
      this.logger.warn(
        `Quota exceeded for user ${userId}: ${usedSeconds}/${quota} seconds`,
      );
      throw new BadRequestException(MEDIA_ERRORS.QUOTA_EXCEEDED);
    }
  }

  /**
   * Extract a temporary title from a YouTube URL (video ID).
   * The worker will replace this with the actual video title.
   */
  private extractYoutubeTitle(url: string): string {
    try {
      const parsed = new URL(url);
      const videoId =
        parsed.searchParams.get('v') || parsed.pathname.split('/').pop();
      return `YouTube Video (${videoId})`;
    } catch {
      return 'YouTube Video';
    }
  }
}
