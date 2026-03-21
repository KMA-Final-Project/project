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
} from './dto';
import { MediaOriginType } from 'prisma/generated/enums';

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
    const title = dto.title || this.extractYoutubeTitle(dto.url);

    const mediaItem = await this.prisma.mediaItem.create({
      data: {
        userId,
        title,
        originType: MediaOriginType.YOUTUBE,
        originUrl: dto.url,
        audioS3Key: placeholderKey,
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
        createdAt: true,
      },
    });

    if (!item) {
      throw new NotFoundException('Media item not found');
    }

    const inventory = await this.minioService.listProcessedArtifacts(mediaId);

    return {
      ...item,
      artifacts: inventory.summary,
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
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(
      items.map(async (item) => {
        const inventory = await this.minioService.listProcessedArtifacts(
          item.id,
        );

        return {
          ...item,
          artifacts: inventory.summary,
        };
      }),
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
}
