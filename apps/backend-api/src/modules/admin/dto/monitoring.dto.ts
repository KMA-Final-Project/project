import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type {
  AdminMonitoringQueueOverview,
  AdminMonitoringQueueItem,
  AdminMonitoringFailuresQuery,
  AdminMonitoringFailureSource,
  AdminMonitoringFailureSummary,
  AdminMonitoringFailureItem,
  AdminMonitoringFailuresResponse,
} from '@kapter/contracts';

export class AdminMonitoringQueueItemDto implements AdminMonitoringQueueItem {
  @ApiProperty({ example: 'transcription' })
  name!: string;

  @ApiProperty({ example: 2 })
  waiting!: number;

  @ApiProperty({ example: 1 })
  active!: number;

  @ApiProperty({ example: 0 })
  delayed!: number;

  @ApiProperty({ example: 120 })
  completed!: number;

  @ApiProperty({ example: 4 })
  failed!: number;

  @ApiProperty({ example: 0 })
  paused!: number;
}

export class AdminMonitoringQueueOverviewDto implements AdminMonitoringQueueOverview {
  @ApiProperty({ example: '2026-06-08T10:00:00.000Z' })
  generatedAt!: string;

  @ApiProperty({ type: [AdminMonitoringQueueItemDto] })
  queues!: AdminMonitoringQueueItemDto[];
}

export class AdminMonitoringFailuresQueryDto implements AdminMonitoringFailuresQuery {
  @ApiProperty({ enum: ['MEDIA', 'QUEUE'] })
  @IsEnum(['MEDIA', 'QUEUE'])
  source!: AdminMonitoringFailureSource;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ enum: ['LOCAL', 'YOUTUBE'] })
  @IsOptional()
  @IsString()
  originType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  failCode?: string;

  @ApiPropertyOptional({ enum: ['transcription', 'ai-processing'] })
  @IsOptional()
  @IsString()
  queueName?: string;
}

export class AdminMonitoringFailureSummaryDto implements AdminMonitoringFailureSummary {
  @ApiProperty({ example: 7 })
  failedMediaCount!: number;

  @ApiProperty({ example: 3 })
  failedQueueJobCount!: number;

  @ApiProperty({ type: [String] })
  availableFailCodes!: string[];
}

export class AdminMonitoringFailureItemDto implements AdminMonitoringFailureItem {
  @ApiProperty({ enum: ['MEDIA', 'QUEUE'] })
  source!: AdminMonitoringFailureSource;

  @ApiProperty()
  occurredAt!: string;

  @ApiPropertyOptional()
  queueName!: string | null;

  @ApiPropertyOptional()
  jobId!: string | null;

  @ApiPropertyOptional()
  attemptsMade!: number | null;

  @ApiPropertyOptional()
  mediaId!: string | null;

  @ApiPropertyOptional()
  mediaTitle!: string | null;

  @ApiPropertyOptional()
  userId!: string | null;

  @ApiPropertyOptional()
  userEmail!: string | null;

  @ApiPropertyOptional()
  originType!: string | null;

  @ApiPropertyOptional()
  failCode!: string | null;

  @ApiPropertyOptional()
  failReason!: string | null;

  @ApiPropertyOptional()
  status!: string | null;
}

export class AdminMonitoringFailuresResponseDto implements AdminMonitoringFailuresResponse {
  @ApiProperty({ enum: ['MEDIA', 'QUEUE'] })
  source!: AdminMonitoringFailureSource;

  @ApiProperty({ type: AdminMonitoringFailureSummaryDto })
  summary!: AdminMonitoringFailureSummaryDto;

  @ApiProperty({ type: [AdminMonitoringFailureItemDto] })
  data!: AdminMonitoringFailureItemDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}
