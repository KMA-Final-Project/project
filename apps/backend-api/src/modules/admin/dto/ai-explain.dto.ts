import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class AiExplainMetricsQueryDto {
  @ApiProperty({ example: '7d', enum: ['7d', '30d'] })
  @IsOptional()
  @IsIn(['7d', '30d'])
  period?: '7d' | '30d' = '7d';
}

export class AiExplainSessionsQueryDto {
  @ApiProperty({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class AiExplainTopSegmentDto {
  @ApiProperty({ example: '15209337-61c8-4a67-9f71-990475f394a4' })
  mediaId!: string;

  @ApiProperty({ example: 'Learn English with Friends' })
  mediaTitle!: string;

  @ApiProperty({ example: 12 })
  segmentIndex!: number;

  @ApiProperty({ example: 'Could I be wearing any more clothes?' })
  segmentText!: string;

  @ApiProperty({ example: 7 })
  requestCount!: number;
}

export class AiExplainDailyUsageDto {
  @ApiProperty({ example: '2026-05-24' })
  date!: string;

  @ApiProperty({ example: 42 })
  requests!: number;

  @ApiProperty({ example: 39 })
  credits!: number;

  @ApiProperty({ example: 18450 })
  tokens!: number;
}

export class AiExplainMetricsDto {
  @ApiProperty({ example: '7d' })
  period!: string;

  @ApiProperty({ example: 120 })
  totalRequests!: number;

  @ApiProperty({ example: 94 })
  totalCreditsConsumed!: number;

  @ApiProperty({ example: 48120 })
  totalTokensInput!: number;

  @ApiProperty({ example: 23140 })
  totalTokensOutput!: number;

  @ApiProperty({ example: 0.42 })
  cacheHitRate!: number;

  @ApiProperty({ example: 1280 })
  averageLatencyMs!: number;

  @ApiProperty({ example: 0.03 })
  guardrailRejectionRate!: number;

  @ApiProperty({ example: 0.82 })
  feedbackPositiveRate!: number;

  @ApiProperty({ type: [AiExplainTopSegmentDto] })
  topSegments!: AiExplainTopSegmentDto[];

  @ApiProperty({ type: [AiExplainDailyUsageDto] })
  dailyUsage!: AiExplainDailyUsageDto[];
}

export class AiExplainSessionItemDto {
  @ApiProperty({ example: '8c8d1605-efc7-4ba0-b951-2bfef40df777' })
  id!: string;

  @ApiProperty({ example: 'user@example.com' })
  userEmail!: string;

  @ApiProperty({ example: 'Learn English with Friends' })
  mediaTitle!: string;

  @ApiProperty({ example: 12 })
  segmentIndex!: number;

  @ApiProperty({ example: 3 })
  messageCount!: number;

  @ApiProperty({ example: '2026-05-24T02:30:00.000Z' })
  updatedAt!: string;
}

export class AiExplainSessionsResponseDto {
  @ApiProperty({ type: [AiExplainSessionItemDto] })
  data!: AiExplainSessionItemDto[];

  @ApiProperty({ example: 120 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;
}
