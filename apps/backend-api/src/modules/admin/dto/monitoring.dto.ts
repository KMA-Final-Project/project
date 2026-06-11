import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import type {
  AdminMonitoringQueueOverview,
  AdminMonitoringQueueItem,
  AdminMonitoringFailuresQuery,
  AdminMonitoringFailureSource,
  AdminMonitoringFailureSummary,
  AdminMonitoringFailureItem,
  AdminMonitoringFailuresResponse,
  AdminTranslationFinalizationSummaryQuery,
  AdminTranslationFinalizationMediaQuery,
  AdminTranslationFinalizationSummaryTotals,
  AdminTranslationFinalizationSummaryAverages,
  AdminTranslationFinalizationProviderBreakdownItem,
  AdminTranslationFinalizationProfileBreakdownItem,
  AdminTranslationFinalizationRouteBreakdownItem,
  AdminTranslationFinalizationDailyUsageItem,
  AdminTranslationFinalizationSummaryResponse,
  AdminTranslationFinalizationMediaListItem,
  AdminTranslationFinalizationMediaListResponse,
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

export class AdminTranslationFinalizationSummaryQueryDto implements AdminTranslationFinalizationSummaryQuery {
  @ApiPropertyOptional({ enum: ['7d', '30d'], default: '7d' })
  @IsOptional()
  @IsIn(['7d', '30d'])
  period?: '7d' | '30d' = '7d';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceLanguage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetLanguage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  profile?: string;
}

export class AdminTranslationFinalizationMediaQueryDto
  extends AdminTranslationFinalizationSummaryQueryDto
  implements AdminTranslationFinalizationMediaQuery
{
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
  @Max(50)
  limit?: number = 20;

  @ApiPropertyOptional({
    enum: ['all', 'healthy', 'fallback', 'deadline_hit', 'failed_windows'],
    default: 'all',
  })
  @IsOptional()
  @IsIn(['all', 'healthy', 'fallback', 'deadline_hit', 'failed_windows'])
  health?: 'all' | 'healthy' | 'fallback' | 'deadline_hit' | 'failed_windows' =
    'all';
}

export class AdminTranslationFinalizationSummaryTotalsDto implements AdminTranslationFinalizationSummaryTotals {
  @ApiProperty()
  completedMedia!: number;

  @ApiProperty()
  finalizedMedia!: number;

  @ApiProperty()
  finalizationEnabledMedia!: number;

  @ApiProperty()
  totalCostUsd!: number;

  @ApiProperty()
  totalPromptTokens!: number;

  @ApiProperty()
  totalCompletionTokens!: number;

  @ApiProperty()
  totalTokens!: number;

  @ApiProperty()
  totalCoverageSegments!: number;

  @ApiProperty()
  totalFallbackSegments!: number;

  @ApiProperty()
  deadlineHitMedia!: number;

  @ApiProperty()
  failedWindowMedia!: number;
}

export class AdminTranslationFinalizationSummaryAveragesDto implements AdminTranslationFinalizationSummaryAverages {
  @ApiProperty()
  costPerMediaUsd!: number;

  @ApiProperty()
  costPerMediaMinuteUsd!: number;

  @ApiProperty()
  tokensPerMedia!: number;

  @ApiProperty()
  coverageRate!: number;

  @ApiProperty()
  fallbackRate!: number;

  @ApiProperty()
  averageWindowSuccessRate!: number;
}

export class AdminTranslationFinalizationProviderBreakdownItemDto implements AdminTranslationFinalizationProviderBreakdownItem {
  @ApiProperty()
  provider!: string;

  @ApiProperty()
  mediaCount!: number;

  @ApiProperty()
  totalCostUsd!: number;

  @ApiProperty()
  totalTokens!: number;
}

export class AdminTranslationFinalizationProfileBreakdownItemDto implements AdminTranslationFinalizationProfileBreakdownItem {
  @ApiProperty()
  profile!: string;

  @ApiProperty()
  mediaCount!: number;

  @ApiProperty()
  totalCostUsd!: number;

  @ApiProperty()
  averageCoverageRate!: number;
}

export class AdminTranslationFinalizationRouteBreakdownItemDto implements AdminTranslationFinalizationRouteBreakdownItem {
  @ApiProperty()
  sourceLanguage!: string;

  @ApiProperty()
  targetLanguage!: string;

  @ApiProperty()
  mediaCount!: number;

  @ApiProperty()
  totalCostUsd!: number;

  @ApiProperty()
  averageCoverageRate!: number;
}

export class AdminTranslationFinalizationDailyUsageItemDto implements AdminTranslationFinalizationDailyUsageItem {
  @ApiProperty()
  date!: string;

  @ApiProperty()
  mediaCount!: number;

  @ApiProperty()
  totalCostUsd!: number;

  @ApiProperty()
  totalTokens!: number;

  @ApiProperty()
  deadlineHits!: number;
}

export class AdminTranslationFinalizationSummaryResponseDto implements AdminTranslationFinalizationSummaryResponse {
  @ApiProperty({ enum: ['7d', '30d'] })
  period!: '7d' | '30d';

  @ApiProperty()
  generatedAt!: string;

  @ApiProperty({ type: AdminTranslationFinalizationSummaryTotalsDto })
  totals!: AdminTranslationFinalizationSummaryTotalsDto;

  @ApiProperty({ type: AdminTranslationFinalizationSummaryAveragesDto })
  averages!: AdminTranslationFinalizationSummaryAveragesDto;

  @ApiProperty({
    type: 'object',
    properties: {
      byProvider: {
        type: 'array',
        items: {
          $ref: '#/components/schemas/AdminTranslationFinalizationProviderBreakdownItemDto',
        },
      },
      byProfile: {
        type: 'array',
        items: {
          $ref: '#/components/schemas/AdminTranslationFinalizationProfileBreakdownItemDto',
        },
      },
      byRoute: {
        type: 'array',
        items: {
          $ref: '#/components/schemas/AdminTranslationFinalizationRouteBreakdownItemDto',
        },
      },
      dailyUsage: {
        type: 'array',
        items: {
          $ref: '#/components/schemas/AdminTranslationFinalizationDailyUsageItemDto',
        },
      },
    },
  })
  breakdowns!: {
    byProvider: AdminTranslationFinalizationProviderBreakdownItemDto[];
    byProfile: AdminTranslationFinalizationProfileBreakdownItemDto[];
    byRoute: AdminTranslationFinalizationRouteBreakdownItemDto[];
    dailyUsage: AdminTranslationFinalizationDailyUsageItemDto[];
  };
}

export class AdminTranslationFinalizationMediaListItemDto implements AdminTranslationFinalizationMediaListItem {
  @ApiProperty()
  mediaId!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  userEmail!: string;

  @ApiProperty()
  sourceLanguage!: string;

  @ApiProperty()
  targetLanguage!: string;

  @ApiProperty()
  durationSeconds!: number;

  @ApiProperty()
  completedAt!: string;

  @ApiProperty()
  provider!: string;

  @ApiProperty()
  model!: string;

  @ApiProperty()
  profile!: string;

  @ApiProperty()
  coverageSegments!: number;

  @ApiProperty()
  fallbackSegments!: number;

  @ApiProperty()
  attemptedWindows!: number;

  @ApiProperty()
  completedWindows!: number;

  @ApiProperty()
  failedWindows!: number;

  @ApiProperty()
  timedOutWindows!: number;

  @ApiProperty()
  invalidWindows!: number;

  @ApiProperty()
  deadlineHit!: boolean;

  @ApiProperty()
  totalPromptTokens!: number;

  @ApiProperty()
  totalCompletionTokens!: number;

  @ApiProperty()
  totalTokens!: number;

  @ApiProperty()
  totalCostUsd!: number;

  @ApiProperty()
  llmRevisedSegments!: number;

  @ApiProperty()
  nmtFallbackSegments!: number;
}

export class AdminTranslationFinalizationMediaListResponseDto implements AdminTranslationFinalizationMediaListResponse {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty({ type: [AdminTranslationFinalizationMediaListItemDto] })
  data!: AdminTranslationFinalizationMediaListItemDto[];
}
