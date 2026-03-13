import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { AuthenticatedUser } from 'src/modules/auth/strategies/jwt.strategy';
import { ErrorResponseDto } from 'src/common/dto';
import { MediaService } from './media.service';
import {
  RequestPresignedUrlDto,
  ConfirmUploadDto,
  SubmitYoutubeDto,
  PresignedUrlResponseDto,
  ConfirmUploadResponseDto,
  SubmitYoutubeResponseDto,
  MediaStatusResponseDto,
  MediaListItemDto,
  DownloadUrlResponseDto,
} from './dto';

@ApiTags('Media')
@ApiBearerAuth()
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  // ==================== Upload & Submit ====================

  /**
   * Step 1 of local upload flow.
   * Returns a presigned PUT URL for the client to upload audio directly to MinIO.
   */
  @Post('presigned-url')
  @ApiOperation({
    summary: 'Get a presigned PUT URL for direct audio upload',
    description:
      'Returns a presigned URL valid for 1 hour. ' +
      'The client should PUT the audio file directly to this URL.',
  })
  @ApiResponse({
    status: 201,
    description: 'Presigned URL generated successfully',
    type: PresignedUrlResponseDto,
  })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  async requestPresignedUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RequestPresignedUrlDto,
  ): Promise<PresignedUrlResponseDto> {
    return this.mediaService.requestPresignedUrl(user.id, dto);
  }

  /**
   * Step 2 of local upload flow.
   * Confirms the file was uploaded and enqueues transcription.
   */
  @Post('confirm-upload')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm file upload and start processing',
    description:
      'Verifies the file exists in object storage, creates a media record, ' +
      'and dispatches a background transcription job.',
  })
  @ApiResponse({
    status: 200,
    description: 'Upload confirmed and job dispatched',
    type: ConfirmUploadResponseDto,
  })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  async confirmUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConfirmUploadDto,
  ): Promise<ConfirmUploadResponseDto> {
    return this.mediaService.confirmUpload(user.id, dto);
  }

  /**
   * YouTube async ingestion flow.
   * Submits a YouTube URL for background download + transcription.
   */
  @Post('youtube')
  @ApiOperation({
    summary: 'Submit a YouTube URL for transcription',
    description:
      'Creates a media record and dispatches a background job. ' +
      'The worker will download the audio and process it asynchronously.',
  })
  @ApiResponse({
    status: 201,
    description: 'Submission accepted and job dispatched',
    type: SubmitYoutubeResponseDto,
  })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  async submitYoutube(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitYoutubeDto,
  ): Promise<SubmitYoutubeResponseDto> {
    return this.mediaService.submitYoutube(user.id, dto);
  }

  // ==================== Status & Library ====================

  /**
   * Get a presigned GET URL for downloading the processed transcript file.
   * Only available for COMPLETED media items.
   */
  @Get(':id/download-url')
  @ApiOperation({
    summary: 'Get a presigned GET URL for the processed transcript',
    description:
      'Returns a presigned URL valid for 1 hour for downloading the final transcript/subtitle JSON from MinIO. ' +
      'Only available when the media item status is COMPLETED.',
  })
  @ApiResponse({
    status: 200,
    description: 'Presigned GET URL generated successfully',
    type: DownloadUrlResponseDto,
  })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  async getProcessedFileUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<DownloadUrlResponseDto> {
    return this.mediaService.getProcessedFileUrl(user.id, id);
  }

  /**
   * Get the processing status of a single media item.
   * Used by clients for polling progress (e.g., every 2-3 seconds).
   */
  @Get(':id/status')
  @ApiOperation({
    summary: 'Get media processing status',
    description:
      'Returns current status, progress (0.0-1.0), detected language, ' +
      'and result S3 keys when complete. Poll this endpoint for live updates.',
  })
  @ApiResponse({ status: 200, type: MediaStatusResponseDto })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  async getMediaStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<MediaStatusResponseDto> {
    return this.mediaService.getMediaStatus(user.id, id);
  }

  /**
   * List all media items for the current user.
   * Returns newest first, excludes soft-deleted items.
   */
  @Get()
  @ApiOperation({
    summary: 'List user media library',
    description:
      'Returns all non-deleted media items for the authenticated user, ' +
      'ordered by creation date (newest first).',
  })
  @ApiResponse({ status: 200, type: [MediaListItemDto] })
  async getUserMediaList(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MediaListItemDto[]> {
    return this.mediaService.getUserMediaList(user.id);
  }
}
