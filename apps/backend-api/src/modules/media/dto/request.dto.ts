import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
  Matches,
  IsUrl,
  IsOptional,
  IsBoolean,
} from 'class-validator';

// ==================== LOCAL UPLOAD FLOW ====================

/**
 * Step 1: Request a presigned PUT URL for direct file upload to MinIO.
 * Client will use the returned URL to upload the file directly.
 */
export class RequestPresignedUrlDto {
  @ApiProperty({
    example: 'lecture-01.mp3',
    description: 'Original file name',
  })
  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @ApiProperty({
    example: 52428800,
    description: 'File size in bytes (used for future size validation)',
  })
  @IsInt()
  @Min(1)
  fileSize!: number;

  @ApiProperty({
    example: 'audio/mpeg',
    description: 'MIME type — only audio formats allowed',
  })
  @IsString()
  @Matches(/^audio\/(mpeg|mp3|wav|flac|ogg|aac|m4a|webm|mp4)$/, {
    message: 'MIME_TYPE_NOT_ALLOWED',
  })
  mimeType!: string;
}

/**
 * Step 2: After the client uploads the file, confirm the upload and
 * trigger background processing.
 */
export class ConfirmUploadDto {
  @ApiProperty({
    example: 'My Lecture Recording',
    description: 'User-friendly title for the media',
  })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({
    example: 'audio/abc123/uuid/lecture-01.mp3',
    description: 'S3 object key returned from the presigned URL step',
  })
  @IsString()
  @IsNotEmpty()
  objectKey!: string;

  @ApiPropertyOptional({
    example: 'vi',
    description:
      'Target language for bilingual subtitle generation (defaults to vi)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2}(-[A-Z]{2})?$/)
  targetLanguage?: string;

  @ApiPropertyOptional({
    example: '15209337-61c8-4a67-9f71-990475f394a4',
    description: 'Pre-allocated MediaItem database ID',
  })
  @IsOptional()
  @IsString()
  mediaId?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether the client uploaded a thumbnail to MinIO',
  })
  @IsOptional()
  @IsBoolean()
  hasThumbnail?: boolean;
}

// ==================== YOUTUBE FLOW ====================

/**
 * Submit a YouTube URL for async download + transcription.
 */
export class SubmitYoutubeDto {
  @ApiProperty({
    example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    description: 'YouTube video URL',
  })
  @IsUrl(
    {
      protocols: ['http', 'https'],
      host_whitelist: [
        'youtube.com',
        'www.youtube.com',
        'youtu.be',
        'm.youtube.com',
      ],
    },
    { message: 'INVALID_YOUTUBE_URL' },
  )
  url!: string;

  @ApiPropertyOptional({
    example: 'Rick Astley - Never Gonna Give You Up',
    description:
      'Optional title override when the client already knows the video name',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    example: 'vi',
    description:
      'Target language for bilingual subtitle generation (defaults to vi)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2}(-[A-Z]{2})?$/)
  targetLanguage?: string;
}
