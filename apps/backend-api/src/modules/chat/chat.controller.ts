import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { AuthenticatedUser } from 'src/modules/auth/strategies/jwt.strategy';
import { ChatService, ChatStreamEvent } from './chat.service';
import {
  ChatFeedbackDto,
  ChatHistoryResponseDto,
  ExplainErrorCode,
  ExplainFinishReason,
  ExplainRequestDto,
} from './dto';

@ApiTags('Kapter Explain')
@ApiBearerAuth()
@Controller('media')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post(':id/explain')
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
    summary: 'Stream a Kapter Explain response for one subtitle segment',
    description:
      'The request body accepts only segmentIndex, optional sessionId, and optional userMessage. ' +
      'Subtitle text and phonetics are resolved server-side from canonical artifacts.',
  })
  @ApiParam({ name: 'id', description: 'Media ID' })
  @ApiResponse({
    status: 200,
    description: 'Server-sent events: meta, delta, error, done.',
  })
  async explain(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') mediaId: string,
    @Body() dto: ExplainRequestDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    this.prepareSseResponse(res);

    const abortController = new AbortController();
    let completed = false;

    req.on('close', () => {
      if (!completed) {
        abortController.abort();
      }
    });

    try {
      for await (const event of this.chatService.streamExplain(
        user.id,
        mediaId,
        dto,
        abortController.signal,
      )) {
        this.writeSseEvent(res, event);
      }
    } catch (error) {
      this.writeSseEvent(res, {
        event: 'error',
        data: {
          code: ExplainErrorCode.SUBTITLE_CONTEXT_UNAVAILABLE,
          message:
            error instanceof Error
              ? error.message
              : 'Subtitle context is not available yet.',
        },
      });
      this.writeSseEvent(res, {
        event: 'done',
        data: {
          tokensUsed: 0,
          finishReason: ExplainFinishReason.STOP,
        },
      });
    } finally {
      completed = true;
      res.end();
    }
  }

  @Get(':id/explain/history')
  @ApiOperation({ summary: 'Get Kapter Explain chat history for one segment' })
  @ApiParam({ name: 'id', description: 'Media ID' })
  @ApiQuery({ name: 'segmentIndex', type: Number })
  @ApiResponse({ status: 200, type: ChatHistoryResponseDto })
  async history(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') mediaId: string,
    @Query('segmentIndex', ParseIntPipe) segmentIndex: number,
  ): Promise<ChatHistoryResponseDto> {
    return this.chatService.getHistory(user.id, mediaId, segmentIndex);
  }

  @Post(':id/explain/feedback')
  @HttpCode(HttpStatus.OK)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  @ApiOperation({ summary: 'Record feedback for one Kapter Explain response' })
  @ApiParam({ name: 'id', description: 'Media ID' })
  async feedback(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') mediaId: string,
    @Body() dto: ChatFeedbackDto,
  ): Promise<{ success: true }> {
    return this.chatService.recordFeedback(user.id, mediaId, dto);
  }

  private prepareSseResponse(res: Response): void {
    res.status(HttpStatus.OK);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
  }

  private writeSseEvent(res: Response, event: ChatStreamEvent): void {
    res.write(`event: ${event.event}\n`);
    res.write(`data: ${JSON.stringify(event.data)}\n\n`);
    (res as Response & { flush?: () => void }).flush?.();
  }
}
