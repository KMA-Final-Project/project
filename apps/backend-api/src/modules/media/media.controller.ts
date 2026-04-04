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
  MediaArtifactsResponseDto,
  StreamUrlResponseDto,
} from './dto';

@ApiTags('Media')
@ApiBearerAuth()
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  // ==================== Upload & Submit ====================

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

  @Post('confirm-upload')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm file upload and start processing',
    description:
      'Verifies the file exists in object storage, creates a media record, ' +
      'and dispatches a background bilingual subtitle-generation job.',
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

  @Post('youtube')
  @ApiOperation({
    summary: 'Submit a YouTube URL for subtitle generation',
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

  // ==================== Status, Resume & Library ====================

  @Get(':id/artifacts')
  @ApiOperation({
    summary: 'Get resumable processed artifact inventory for a media item',
    description:
      'Returns ordered chunk, translated-batch, and final artifact availability ' +
      'for a user-owned media item so reconnecting clients can resume from durable state.',
  })
  @ApiResponse({ status: 200, type: MediaArtifactsResponseDto })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  async getMediaArtifacts(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<MediaArtifactsResponseDto> {
    return this.mediaService.getMediaArtifacts(user.id, id);
  }

  @Get(':id/stream-url')
  @ApiOperation({
    summary: 'Get direct stream URLs for a YouTube-sourced media item',
    description:
      'Calls yt-dlp to resolve direct, signed video and audio stream URLs without downloading. ' +
      'Only available for YouTube-origin media items. ' +
      'URLs expire after ~6 hours — clients should call this fresh each playback session.',
  })
  @ApiResponse({
    status: 200,
    description: 'Direct stream URLs resolved successfully',
    type: StreamUrlResponseDto,
  })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async getStreamUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<StreamUrlResponseDto> {
    return this.mediaService.getStreamUrl(user.id, id);
  }

  @Get(':id/download-url')
  @ApiOperation({
    summary: 'Get a presigned GET URL for the canonical final artifact',
    description:
      'Returns a presigned URL valid for 1 hour for downloading the final processed artifact JSON from MinIO. ' +
      'This route resolves the canonical final artifact from durable storage instead of assuming a final-only DB field is authoritative.',
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

  @Get(':id/status')
  @ApiOperation({
    summary: 'Get media processing status',
    description:
      'Returns current status, progress, pipeline stage, compatibility output keys, ' +
      'and durable partial/final artifact availability for reconnect-safe resume.',
  })
  @ApiResponse({ status: 200, type: MediaStatusResponseDto })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  async getMediaStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<MediaStatusResponseDto> {
    return this.mediaService.getMediaStatus(user.id, id);
  }

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
