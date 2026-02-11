import { ApiProperty } from '@nestjs/swagger';

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
    enum: ['QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED'],
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
    enum: ['QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED'],
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
