import { ApiProperty } from '@nestjs/swagger';
import { PipelineStage } from 'src/common/constants';

// ==================== Presigned URL Response ====================

export class PresignedUrlResponseDto {
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
}

// ==================== Confirm Upload Response ====================

export class ConfirmUploadResponseDto {
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
  status: string;

  @ApiProperty({
    description: 'BullMQ job ID for tracking',
    example: '42',
  })
  jobId: string;
}

// ==================== YouTube Submission Response ====================

export class SubmitYoutubeResponseDto {
  @ApiProperty({
    description: 'MediaItem database ID',
    example: '15209337-61c8-4a67-9f71-990475f394a4',
  })
  id: string;

  @ApiProperty({
    description: 'Media title (auto-extracted from URL if not provided)',
    example: 'YouTube Video (dQw4w9WgXcQ)',
  })
  title: string;

  @ApiProperty({
    description: 'Current processing status',
    example: 'QUEUED',
    enum: ['QUEUED', 'VALIDATING', 'PROCESSING', 'COMPLETED', 'FAILED'],
  })
  status: string;

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
}

// ==================== Artifact Inventory ====================

export class MediaArtifactsSummaryDto {
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

  @ApiProperty({
    enum: ['TRANSCRIBE', 'TRANSCRIBE_TRANSLATE'],
    example: 'TRANSCRIBE_TRANSLATE',
  })
  processingMode: string;

  @ApiProperty({ example: 'en', nullable: true })
  sourceLanguage: string | null;

  @ApiProperty({ example: 120, description: 'Duration in seconds' })
  durationSeconds: number;

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
    example: 'TRANSCRIBING',
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
      'Durable partial/final artifact availability discovered from MinIO for reconnect-safe resume.',
  })
  artifacts: MediaArtifactsSummaryDto;

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

  @ApiProperty({ enum: ['TRANSCRIBE', 'TRANSCRIBE_TRANSLATE'] })
  processingMode: string;

  @ApiProperty({ enum: ['LOCAL', 'YOUTUBE'] })
  originType: string;

  @ApiProperty({ nullable: true })
  originUrl: string | null;

  @ApiProperty()
  durationSeconds: number;

  @ApiProperty({
    description: 'Current pipeline stage (null when idle or completed)',
    nullable: true,
    enum: PipelineStage,
  })
  currentStep: string | null;

  @ApiProperty()
  createdAt: Date;
}
