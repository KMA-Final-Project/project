import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { AuthenticatedUser } from 'src/modules/auth/strategies/jwt.strategy';
import {
  LookupRequestDto,
  LookupResponseDto,
  SaveLookupWordDto,
  SaveLookupWordResponseDto,
} from './dto';
import { LookupService } from './lookup.service';

@ApiTags('Vocabulary Lookup')
@ApiBearerAuth()
@Controller('media')
export class LookupController {
  constructor(private readonly lookupService: LookupService) {}

  @Post(':id/lookup')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  @ApiOperation({
    summary: 'Lookup a word or phrase inside one canonical subtitle segment',
    description:
      'The request body carries only canonical segment and word-boundary coordinates. ' +
      'The backend resolves sentence context and returns one atomic JSON payload.',
  })
  @ApiParam({ name: 'id', description: 'Media ID' })
  @ApiResponse({ status: 200, type: LookupResponseDto })
  async lookup(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') mediaId: string,
    @Body() dto: LookupRequestDto,
  ): Promise<LookupResponseDto> {
    return this.lookupService.lookup(user.id, mediaId, dto);
  }

  @Post(':id/lookup/bookmark')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  @ApiOperation({
    summary: 'Persist one explicitly saved vocabulary lookup snapshot',
  })
  @ApiParam({ name: 'id', description: 'Media ID' })
  @ApiResponse({ status: 200, type: SaveLookupWordResponseDto })
  async bookmark(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') mediaId: string,
    @Body() dto: SaveLookupWordDto,
  ): Promise<SaveLookupWordResponseDto> {
    return this.lookupService.saveWord(user.id, mediaId, dto);
  }
}
