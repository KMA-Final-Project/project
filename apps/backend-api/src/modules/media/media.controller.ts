import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
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
} from './dto';

@ApiTags('Media')
@ApiBearerAuth()
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

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
    description:
      'Presigned URL generated. Returns { uploadUrl, objectKey, expiresIn }',
  })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  async requestPresignedUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RequestPresignedUrlDto,
  ) {
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
    description: 'Upload confirmed. Returns { id, title, status, jobId }',
  })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  async confirmUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConfirmUploadDto,
  ) {
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
    description:
      'Submission accepted. Returns { id, title, status, originUrl, jobId }',
  })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  async submitYoutube(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitYoutubeDto,
  ) {
    return this.mediaService.submitYoutube(user.id, dto);
  }
}
