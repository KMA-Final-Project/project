import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import { MinioService } from 'src/modules/minio/minio.service';
import { QueueService } from 'src/modules/queue/queue.service';
import { MEDIA_ERRORS } from 'src/common/constants/error-messages';
import type { ProcessedArtifactSummary } from 'src/modules/minio/minio.service';
import { YtDlpService } from './yt-dlp.service';
import {
  RequestPresignedUrlDto,
  ConfirmUploadDto,
  SubmitYoutubeDto,
} from './dto';
import type {
  PresignedUrlResponseDto,
  ConfirmUploadResponseDto,
  SubmitYoutubeResponseDto,
  DownloadUrlResponseDto,
  MediaArtifactsResponseDto,
  StreamUrlResponseDto,
} from './dto';
import { MediaOriginType } from 'prisma/generated/enums';
import {
  artifactSummariesEqual,
  createEmptyArtifactSummary,
  mergeBatchArtifactSummary,
  mergeChunkArtifactSummary,
  mergeFinalArtifactSummary,
  normalizeArtifactSummary,
  toArtifactSummaryJson,
} from './media-artifact-summary';

/** Presigned URL validity: 1 hour */
const PRESIGNED_URL_EXPIRY_SECONDS = 3600;

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly minioService: MinioService,
    private readonly queueService: QueueService,
    private readonly ytDlpService: YtDlpService,
  ) {}

  // ==================== PRESIGNED URL FLOW ====================

  async requestPresignedUrl(
    userId: string,
    dto: RequestPresignedUrlDto,
  ): Promise<PresignedUrlResponseDto> {
    await this.assertQuotaNotExceeded(userId);

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

  async confirmUpload(
    userId: string,
    dto: ConfirmUploadDto,
  ): Promise<ConfirmUploadResponseDto> {
    const exists = await this.minioService.verifyObjectExists(dto.objectKey);
    if (!exists) {
      throw new BadRequestException(MEDIA_ERRORS.FILE_NOT_FOUND);
    }

    const mediaItem = await this.prisma.mediaItem.create({
      data: {
        userId,
        title: dto.title,
        originType: MediaOriginType.LOCAL,
        audioS3Key: dto.objectKey,
        artifactSummary: toArtifactSummaryJson(createEmptyArtifactSummary()),
        status: 'QUEUED',
      },
    });

    const jobId = await this.queueService.dispatchTranscriptionJob({
      mediaId: mediaItem.id,
      type: MediaOriginType.LOCAL,
      filePath: dto.objectKey,
      userId,
      targetLanguage: dto.targetLanguage,
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

  async submitYoutube(
    userId: string,
    dto: SubmitYoutubeDto,
  ): Promise<SubmitYoutubeResponseDto> {
    await this.assertQuotaNotExceeded(userId);

    const placeholderKey = `audio/${userId}/${randomUUID()}/youtube-pending`;
    const title =
      dto.title?.trim() || (await this.resolveYoutubeSubmissionTitle(dto.url));

    const mediaItem = await this.prisma.mediaItem.create({
      data: {
        userId,
        title,
        originType: MediaOriginType.YOUTUBE,
        originUrl: dto.url,
        audioS3Key: placeholderKey,
        artifactSummary: toArtifactSummaryJson(createEmptyArtifactSummary()),
        status: 'QUEUED',
      },
    });

    const jobId = await this.queueService.dispatchTranscriptionJob({
      mediaId: mediaItem.id,
      type: MediaOriginType.YOUTUBE,
      url: dto.url,
      userId,
      targetLanguage: dto.targetLanguage,
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

  // ==================== STATUS, RESUME & LIBRARY ====================

  async getMediaArtifacts(
    userId: string,
    mediaId: string,
  ): Promise<MediaArtifactsResponseDto> {
    const item = await this.prisma.mediaItem.findFirst({
      where: { id: mediaId, userId, deletedAt: null },
      select: { id: true, status: true },
    });

    if (!item) {
      throw new NotFoundException('Media item not found');
    }

    const inventory = await this.minioService.listProcessedArtifacts(mediaId);
    await this.persistArtifactSummary(mediaId, inventory.summary);

    const [chunks, translatedBatches, final] = await Promise.all([
      Promise.all(
        inventory.chunks.map(async (chunk) => ({
          chunkIndex: chunk.chunkIndex,
          objectKey: chunk.objectKey,
          url: await this.minioService.generatePresignedGetUrl(chunk.objectKey),
          size: chunk.size,
          lastModified: chunk.lastModified,
        })),
      ),
      Promise.all(
        inventory.translatedBatches.map(async (batch) => ({
          batchIndex: batch.batchIndex,
          objectKey: batch.objectKey,
          url: await this.minioService.generatePresignedGetUrl(batch.objectKey),
          size: batch.size,
          lastModified: batch.lastModified,
        })),
      ),
      inventory.final
        ? this.minioService
            .generatePresignedGetUrl(inventory.final.objectKey)
            .then((url) => ({
              objectKey: inventory.final!.objectKey,
              url,
              size: inventory.final!.size,
              lastModified: inventory.final!.lastModified,
            }))
        : Promise.resolve(null),
    ]);

    return {
      mediaId: item.id,
      status: item.status,
      summary: inventory.summary,
      chunks,
      translatedBatches,
      final,
    };
  }

  async getProcessedFileUrl(
    userId: string,
    mediaId: string,
  ): Promise<DownloadUrlResponseDto> {
    const ownsMedia = await this.isMediaOwnedByUser(userId, mediaId);
    if (!ownsMedia) {
      throw new NotFoundException('Media item not found');
    }

    const inventory = await this.minioService.listProcessedArtifacts(mediaId);
    await this.persistArtifactSummary(mediaId, inventory.summary);
    if (!inventory.final) {
      throw new BadRequestException(
        'Final processed artifact is not available yet',
      );
    }

    const url = await this.minioService.generatePresignedGetUrl(
      inventory.final.objectKey,
    );
    return { url };
  }

  async getStreamUrl(
    userId: string,
    mediaId: string,
  ): Promise<StreamUrlResponseDto> {
    const item = await this.prisma.mediaItem.findFirst({
      where: { id: mediaId, userId, deletedAt: null },
      select: { id: true, originType: true, originUrl: true },
    });

    if (!item) {
      throw new NotFoundException('Media item not found');
    }

    if (item.originType !== 'YOUTUBE') {
      throw new BadRequestException(
        'Stream URLs are only available for YouTube-sourced media items.',
      );
    }

    if (!item.originUrl) {
      throw new BadRequestException(
        'This media item has no associated YouTube URL.',
      );
    }

    const info = await this.ytDlpService.resolveStreamUrls(item.originUrl);

    return {
      videoUrl: info.videoUrl,
      audioUrl: info.audioUrl,
      title: info.title,
      durationSeconds: info.durationSeconds,
      originUrl: info.originUrl,
      thumbnailUrl: info.thumbnailUrl,
      expiresInSeconds: info.expiresInSeconds,
    };
  }

  async getMediaStatus(userId: string, mediaId: string) {
    const item = await this.prisma.mediaItem.findFirst({
      where: {
        id: mediaId,
        userId,
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
        status: true,
        progress: true,
        sourceLanguage: true,
        durationSeconds: true,
        failReason: true,
        originType: true,
        currentStep: true,
        estimatedTimeRemaining: true,
        transcriptS3Key: true,
        subtitleS3Key: true,
        artifactSummary: true,
        createdAt: true,
      },
    });

    if (!item) {
      throw new NotFoundException('Media item not found');
    }
    return {
      ...item,
      artifacts: normalizeArtifactSummary(item.artifactSummary),
    };
  }

  async getUserMediaList(userId: string) {
    const items = await this.prisma.mediaItem.findMany({
      where: {
        userId,
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
        status: true,
        progress: true,
        originType: true,
        originUrl: true,
        durationSeconds: true,
        currentStep: true,
        artifactSummary: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return items.map((item) => ({
      ...item,
      artifacts: normalizeArtifactSummary(item.artifactSummary),
    }));
  }

  async recordChunkArtifact(
    mediaId: string,
    chunkIndex: number,
  ): Promise<void> {
    await this.updateArtifactSummary(mediaId, (current) =>
      mergeChunkArtifactSummary(current, chunkIndex),
    );
  }

  async recordTranslatedBatchArtifact(
    mediaId: string,
    batchIndex: number,
  ): Promise<void> {
    await this.updateArtifactSummary(mediaId, (current) =>
      mergeBatchArtifactSummary(current, batchIndex),
    );
  }

  async recordFinalArtifact(
    mediaId: string,
    finalObjectKey: string,
  ): Promise<void> {
    await this.updateArtifactSummary(mediaId, (current) =>
      mergeFinalArtifactSummary(current, finalObjectKey),
    );
  }

  async isMediaOwnedByUser(userId: string, mediaId: string): Promise<boolean> {
    const item = await this.prisma.mediaItem.findFirst({
      where: {
        id: mediaId,
        userId,
        deletedAt: null,
      },
      select: { id: true },
    });

    return Boolean(item);
  }

  // ==================== PRIVATE HELPERS ====================

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

    if (!user.currentSubscription) {
      throw new BadRequestException(MEDIA_ERRORS.QUOTA_EXCEEDED);
    }

    const quota = user.currentSubscription.monthlyQuotaSecondsSnapshot;
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

  private async resolveYoutubeSubmissionTitle(url: string): Promise<string> {
    try {
      const ytDlpTitleResolver = this.ytDlpService as {
        resolveTitle: (youtubeUrl: string) => Promise<string>;
      };
      const title = await ytDlpTitleResolver.resolveTitle(url);
      const normalizedTitle = title.trim();

      if (normalizedTitle.length > 0) {
        return normalizedTitle;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Falling back to parsed YouTube title for ${url}: ${message}`,
      );
    }

    return this.extractYoutubeTitle(url);
  }

  private async persistArtifactSummary(
    mediaId: string,
    summary: ProcessedArtifactSummary,
  ): Promise<void> {
    const normalized = normalizeArtifactSummary(summary);

    await this.prisma.mediaItem.updateMany({
      where: { id: mediaId },
      data: {
        artifactSummary: toArtifactSummaryJson(normalized),
      },
    });
  }

  private async updateArtifactSummary(
    mediaId: string,
    updater: (current: unknown) => ProcessedArtifactSummary,
  ): Promise<void> {
    const item = await this.prisma.mediaItem.findUnique({
      where: { id: mediaId },
      select: { artifactSummary: true },
    });

    if (!item) {
      return;
    }

    const currentSummary = normalizeArtifactSummary(item.artifactSummary);
    const nextSummary = updater(item.artifactSummary);

    if (artifactSummariesEqual(currentSummary, nextSummary)) {
      return;
    }

    await this.persistArtifactSummary(mediaId, nextSummary);
  }
}
