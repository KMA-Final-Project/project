import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  ChatFeedbackRequest,
  ChatHistoryFeedback,
  ChatHistoryMessage,
  ChatHistoryResponse,
  ExplainDeltaEvent,
  ExplainDoneEvent,
  ExplainErrorEvent,
  ExplainMetaEvent,
  ExplainRequest,
} from '@kapter/contracts';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export enum ExplainFinishReason {
  STOP = 'stop',
  LENGTH = 'length',
  ABORTED = 'aborted',
}

export enum ExplainErrorCode {
  INSUFFICIENT_CREDITS = 'INSUFFICIENT_CREDITS',
  GUARDRAIL_REJECTED = 'GUARDRAIL_REJECTED',
  SUBTITLE_CONTEXT_UNAVAILABLE = 'SUBTITLE_CONTEXT_UNAVAILABLE',
  LLM_UNAVAILABLE = 'LLM_UNAVAILABLE',
  LLM_ERROR = 'LLM_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
}

export enum ChatFeedbackRating {
  POSITIVE = 'POSITIVE',
  NEGATIVE = 'NEGATIVE',
}

export class ExplainRequestDto implements ExplainRequest {
  @ApiProperty({
    example: 12,
    description: '0-based canonical subtitle segment index.',
  })
  @IsInt()
  @Min(0)
  segmentIndex!: number;

  @ApiPropertyOptional({
    example: '8c8d1605-efc7-4ba0-b951-2bfef40df777',
    description: 'Required for follow-up messages.',
  })
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @ApiPropertyOptional({
    example: "Why is 'already' translated as 'rồi' here?",
    description:
      'User follow-up question. Omitted for the initial system-generated explain request.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  userMessage?: string;
}

export class ExplainMetaEventDto implements ExplainMetaEvent {
  @ApiProperty({ example: '8c8d1605-efc7-4ba0-b951-2bfef40df777' })
  sessionId!: string;

  @ApiProperty({ example: '73f80729-67a4-4b0b-a941-8788c45a28f9' })
  messageId!: string;

  @ApiProperty({ example: false })
  cacheHit!: boolean;

  @ApiProperty({ example: 42 })
  creditsRemaining!: number;

  @ApiProperty({ example: 'gpt-4o-mini' })
  model!: string;

  @ApiProperty({ example: 'v3' })
  promptVersion!: string;
}

export class ExplainDeltaEventDto implements ExplainDeltaEvent {
  @ApiProperty({ example: 'This phrase is translated this way because...' })
  content!: string;
}

export class ExplainErrorEventDto implements ExplainErrorEvent {
  @ApiProperty({ enum: ExplainErrorCode })
  code!: ExplainErrorCode;

  @ApiProperty({ example: 'AI assistant is temporarily unavailable.' })
  message!: string;
}

export class ExplainDoneEventDto implements ExplainDoneEvent {
  @ApiProperty({ example: 324 })
  tokensUsed!: number;

  @ApiProperty({ enum: ExplainFinishReason, example: ExplainFinishReason.STOP })
  finishReason!: ExplainFinishReason;
}

export class ChatFeedbackDto implements ChatFeedbackRequest {
  @ApiProperty({ example: '73f80729-67a4-4b0b-a941-8788c45a28f9' })
  @IsUUID()
  chatMessageId!: string;

  @ApiProperty({
    enum: ChatFeedbackRating,
    example: ChatFeedbackRating.POSITIVE,
  })
  @IsEnum(ChatFeedbackRating)
  rating!: ChatFeedbackRating;

  @ApiPropertyOptional({ example: 'inaccurate', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reason?: string;
}

export class ChatHistoryFeedbackDto implements ChatHistoryFeedback {
  @ApiProperty({ enum: ChatFeedbackRating })
  rating!: ChatFeedbackRating;
}

export class ChatHistoryMessageDto implements ChatHistoryMessage {
  @ApiProperty({ example: '73f80729-67a4-4b0b-a941-8788c45a28f9' })
  id!: string;

  @ApiProperty({ enum: ['user', 'assistant'] })
  role!: 'user' | 'assistant';

  @ApiProperty({ example: 'The sentence uses present perfect...' })
  content!: string;

  @ApiProperty({ example: '2026-05-24T02:30:00.000Z' })
  createdAt!: string;

  @ApiPropertyOptional({ type: ChatHistoryFeedbackDto })
  feedback?: ChatHistoryFeedbackDto;
}

export class ChatHistoryResponseDto implements ChatHistoryResponse {
  @ApiProperty({
    example: '8c8d1605-efc7-4ba0-b951-2bfef40df777',
    nullable: true,
  })
  sessionId!: string | null;

  @ApiProperty({ example: 12 })
  segmentIndex!: number;

  @ApiProperty({ type: [ChatHistoryMessageDto] })
  messages!: ChatHistoryMessageDto[];
}
