import { ApiProperty } from '@nestjs/swagger';
import type {
  ConfirmUploadResponse,
  MediaArtifactsSummary,
  MediaStreamResponse,
  PresignedUrlResponse,
  SubmitYouTubeResponse,
} from '@kapter/contracts';
import { PipelineStage } from 'src/common/constants';

// ==================== Presigned URL Response ====================

export class PresignedUrlResponseDto implements PresignedUrlResponse {
  @ApiProperty({
    description: 'Public-facing presigned PUT URL for direct upload to MinIO',
    example:
      'https://bilingual-minio.sondndev.id.vn/raw/audio/user-id/uuid/file.mp3?X-Amz-...',
  })
  uploadUrl: string;

  @ApiProperty({
    description: 'S3 object key — pass this to confirm-upload after uploading',
    example:
      'audio/d3ee9ba9-1d6a-489f-94bc-c880d4500e7d/a1b2c3d4/recording.mp3',
  })
  objectKey: string;

  @ApiProperty({
    description: 'URL validity in seconds',
    example: 3600,
  })
  expiresIn: number;

  @ApiProperty({
    description: 'Pre-allocated MediaItem database ID',
    example: '15209337-61c8-4a67-9f71-990475f394a4',
  })
  mediaId: string;

  @ApiProperty({
    description:
      'Public-facing presigned PUT URL for uploading the captured local video thumbnail (null if not video)',
    example:
      'https://bilingual-minio.sondndev.id.vn/processed/media-id/thumbnail.jpg?X-Amz-...',
    nullable: true,
  })
  thumbnailUploadUrl?: string;
}

// ==================== Confirm Upload Response ====================

export class ConfirmUploadResponseDto implements ConfirmUploadResponse {
  @ApiProperty({
    description: 'MediaItem database ID',
    example: '15209337-61c8-4a67-9f71-990475f394a4',
  })
  id: string;

  @ApiProperty({
    description: 'Media title',
    example: 'My Podcast Episode',
  })
  title: string;

  @ApiProperty({
    description: 'Current processing status',
    example: 'QUEUED',
    enum: ['QUEUED', 'VALIDATING', 'PROCESSING', 'COMPLETED', 'FAILED'],
  })
  status: ConfirmUploadResponse['status'];

  @ApiProperty({
    description: 'BullMQ job ID for tracking',
    example: '42',
  })
  jobId: string;

  @ApiProperty({
    description: 'Canonical target language stored on the media record',
    example: 'vi',
    nullable: true,
  })
  targetLanguage?: string | null;
}

// ==================== YouTube Submission Response ====================

export class SubmitYoutubeResponseDto implements SubmitYouTubeResponse {
  @ApiProperty({
    description: 'MediaItem database ID',
    example: '15209337-61c8-4a67-9f71-990475f394a4',
  })
  id: string;

  @ApiProperty({
    description:
      'Media title from the client, yt-dlp metadata, or URL fallback when metadata is unavailable',
    example: 'Rick Astley - Never Gonna Give You Up',
  })
  title: string;

  @ApiProperty({
    description: 'Current processing status',
    example: 'QUEUED',
    enum: ['QUEUED', 'VALIDATING', 'PROCESSING', 'COMPLETED', 'FAILED'],
  })
  status: SubmitYouTubeResponse['status'];

  @ApiProperty({
    description: 'Original YouTube URL',
    example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    nullable: true,
  })
  originUrl: string | null;

  @ApiProperty({
    description: 'BullMQ job ID for tracking',
    example: '43',
  })
  jobId: string;

  @ApiProperty({
    description: 'Canonical target language stored on the media record',
    example: 'vi',
    nullable: true,
  })
  targetLanguage?: string | null;
}

// ==================== Artifact Inventory ====================

export class MediaArtifactsSummaryDto implements MediaArtifactsSummary {
  @ApiProperty({ example: 3 })
  chunkCount: number;

  @ApiProperty({ example: 2 })
  translatedBatchCount: number;

  @ApiProperty({ example: true })
  hasFinal: boolean;

  @ApiProperty({ example: 2, nullable: true })
  latestChunkIndex: number | null;

  @ApiProperty({ example: 1, nullable: true })
  latestBatchIndex: number | null;

  @ApiProperty({
    description: 'Canonical object key for final.json when available',
    example: '15209337-61c8-4a67-9f71-990475f394a4/final.json',
    nullable: true,
  })
  finalObjectKey: string | null;
}

export class MediaChunkArtifactDto {
  @ApiProperty({ example: 0 })
  chunkIndex: number;

  @ApiProperty({
    example: '15209337-61c8-4a67-9f71-990475f394a4/chunks/0.json',
  })
  objectKey: string;

  @ApiProperty({
    example:
      'https://bilingual-minio.sondndev.id.vn/processed/media-id/chunks/0.json?X-Amz-...',
  })
  url: string;

  @ApiProperty({ example: 2048 })
  size: number;

  @ApiProperty({ nullable: true })
  lastModified: Date | null;
}

export class MediaTranslatedBatchArtifactDto {
  @ApiProperty({ example: 0 })
  batchIndex: number;

  @ApiProperty({
    example: '15209337-61c8-4a67-9f71-990475f394a4/translated_batches/0.json',
  })
  objectKey: string;

  @ApiProperty({
    example:
      'https://bilingual-minio.sondndev.id.vn/processed/media-id/translated_batches/0.json?X-Amz-...',
  })
  url: string;

  @ApiProperty({ example: 4096 })
  size: number;

  @ApiProperty({ nullable: true })
  lastModified: Date | null;
}

export class MediaFinalArtifactDto {
  @ApiProperty({
    example: '15209337-61c8-4a67-9f71-990475f394a4/final.json',
  })
  objectKey: string;

  @ApiProperty({
    example:
      'https://bilingual-minio.sondndev.id.vn/processed/media-id/final.json?X-Amz-...',
  })
  url: string;

  @ApiProperty({ example: 8192 })
  size: number;

  @ApiProperty({ nullable: true })
  lastModified: Date | null;
}

export class MediaArtifactsResponseDto {
  @ApiProperty({ example: '15209337-61c8-4a67-9f71-990475f394a4' })
  mediaId: string;

  @ApiProperty({
    enum: ['QUEUED', 'VALIDATING', 'PROCESSING', 'COMPLETED', 'FAILED'],
    example: 'PROCESSING',
  })
  status: string;

  @ApiProperty({ type: MediaArtifactsSummaryDto })
  summary: MediaArtifactsSummaryDto;

  @ApiProperty({ type: [MediaChunkArtifactDto] })
  chunks: MediaChunkArtifactDto[];

  @ApiProperty({ type: [MediaTranslatedBatchArtifactDto] })
  translatedBatches: MediaTranslatedBatchArtifactDto[];

  @ApiProperty({ type: MediaFinalArtifactDto, nullable: true })
  final: MediaFinalArtifactDto | null;
}

// ==================== Media Status (Progress Tracking) ====================

export class MediaStatusResponseDto {
  @ApiProperty({ example: '15209337-61c8-4a67-9f71-990475f394a4' })
  id: string;

  @ApiProperty({ example: 'My Podcast Episode' })
  title: string;

  @ApiProperty({
    enum: ['QUEUED', 'VALIDATING', 'PROCESSING', 'COMPLETED', 'FAILED'],
    example: 'PROCESSING',
  })
  status: string;

  @ApiProperty({
    description: 'Progress from 0.0 to 1.0',
    example: 0.65,
  })
  progress: number;

  @ApiProperty({ example: 'en', nullable: true })
  sourceLanguage: string | null;

  @ApiProperty({ example: 'vi', nullable: true })
  targetLanguage: string | null;

  @ApiProperty({ example: 120, description: 'Duration in seconds' })
  durationSeconds: number;

  @ApiProperty({
    description: 'Machine-readable failure code (only when status=FAILED)',
    example: 'quotaExceeded',
    nullable: true,
  })
  failCode: string | null;

  @ApiProperty({
    description: 'Human-readable error (only when status=FAILED)',
    example: null,
    nullable: true,
  })
  failReason: string | null;

  @ApiProperty({ example: 'LOCAL', enum: ['LOCAL', 'YOUTUBE'] })
  originType: string;

  @ApiProperty({
    description: 'Current pipeline stage (null when idle or completed)',
    example: 'PROCESSING',
    nullable: true,
    enum: PipelineStage,
  })
  currentStep: string | null;

  @ApiProperty({
    description:
      'Estimated seconds remaining until completion (null when idle or completed)',
    example: 45,
    nullable: true,
  })
  estimatedTimeRemaining: number | null;

  @ApiProperty({
    description:
      'Compatibility field for the canonical final object key stored on the MediaItem row when available.',
    nullable: true,
  })
  transcriptS3Key: string | null;

  @ApiProperty({ nullable: true })
  subtitleS3Key: string | null;

  @ApiProperty({
    type: MediaArtifactsSummaryDto,
    description:
      'Cached partial/final artifact availability maintained from AI events and refreshed by the dedicated artifacts endpoint.',
  })
  artifacts: MediaArtifactsSummaryDto;

  @ApiProperty({
    description:
      'Presigned GET URL or CDN URL of the media thumbnail (null if unavailable or pure audio)',
    example:
      'https://bilingual-minio.sondndev.id.vn/processed/media-id/thumbnail.jpg?X-Amz-...',
    nullable: true,
  })
  thumbnailUrl: string | null;

  @ApiProperty()
  createdAt: Date;
}

// ==================== Processed File Download ====================

export class DownloadUrlResponseDto {
  @ApiProperty({
    description: 'Presigned GET URL for the canonical final processed artifact',
    example:
      'https://bilingual-minio.sondndev.id.vn/processed/media-id/final.json?X-Amz-...',
  })
  url: string;
}

export class MediaListItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({
    enum: ['QUEUED', 'VALIDATING', 'PROCESSING', 'COMPLETED', 'FAILED'],
  })
  status: string;

  @ApiProperty()
  progress: number;

  @ApiProperty({ enum: ['LOCAL', 'YOUTUBE'] })
  originType: string;

  @ApiProperty({ nullable: true })
  originUrl: string | null;

  @ApiProperty()
  durationSeconds: number;

  @ApiProperty({ example: 'en', nullable: true })
  sourceLanguage: string | null;

  @ApiProperty({ example: 'vi', nullable: true })
  targetLanguage: string | null;

  @ApiProperty({
    description: 'Machine-readable failure code (only when status=FAILED)',
    example: 'quotaExceeded',
    nullable: true,
  })
  failCode: string | null;

  @ApiProperty({
    type: MediaArtifactsSummaryDto,
    description:
      'Cached artifact availability summary stored with the media record for hot library reads.',
  })
  artifacts: MediaArtifactsSummaryDto;

  @ApiProperty({
    description: 'Current pipeline stage (null when idle or completed)',
    nullable: true,
    enum: PipelineStage,
  })
  currentStep: string | null;

  @ApiProperty({
    description:
      'Presigned GET URL or CDN URL of the media thumbnail (null if unavailable or pure audio)',
    example:
      'https://bilingual-minio.sondndev.id.vn/processed/media-id/thumbnail.jpg?X-Amz-...',
    nullable: true,
  })
  thumbnailUrl: string | null;

  @ApiProperty()
  createdAt: Date;
}

// ==================== Stream URL Response ====================

export class StreamUrlResponseDto implements MediaStreamResponse {
  @ApiProperty({
    description:
      'Direct video stream URL (may be null for audio-only content or when yt-dlp resolves only audio)',
    nullable: true,
    example:
      'https://rr2---sn-xxx.googlevideo.com/videoplayback?expire=...&itag=248&...',
  })
  videoUrl: string | null;

  @ApiProperty({
    description:
      'Direct audio-only stream URL. Always present. Falls back to the video URL when no separate audio track exists.',
    example:
      'https://rr2---sn-xxx.googlevideo.com/videoplayback?expire=...&itag=251&...',
  })
  audioUrl: string;

  @ApiProperty({
    description: 'Video title from YouTube metadata',
    example: 'Learn English with Friends | Season 1 Episode 1',
  })
  title: string;

  @ApiProperty({
    description: 'Duration of the video in seconds',
    example: 1320,
  })
  durationSeconds: number;

  @ApiProperty({
    description: 'Original YouTube URL stored in the media record',
    example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  })
  originUrl: string;

  @ApiProperty({
    description: 'YouTube thumbnail URL (null if unavailable)',
    nullable: true,
    example: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
  })
  thumbnailUrl: string | null;

  @ApiProperty({
    description:
      'Approximate seconds until the signed stream URLs expire (~6 hours for YouTube)',
    example: 21600,
  })
  expiresInSeconds: number;
}
