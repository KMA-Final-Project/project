import { ApiProperty } from '@nestjs/swagger';
import type { AdminOverview, QueueOverviewItem } from '@kapter/contracts';

export class QueueOverviewItemDto implements QueueOverviewItem {
  @ApiProperty({ example: 'transcription' })
  name!: string;

  @ApiProperty({ example: 2 })
  waiting!: number;

  @ApiProperty({ example: 1 })
  active!: number;

  @ApiProperty({ example: 120 })
  completed!: number;

  @ApiProperty({ example: 4 })
  failed!: number;

  @ApiProperty({ example: 0 })
  delayed!: number;

  @ApiProperty({ example: 0 })
  paused!: number;
}

export class AdminOverviewDto implements AdminOverview {
  @ApiProperty({ example: 42 })
  totalUsers!: number;

  @ApiProperty({ example: 18 })
  activeSubscriptions!: number;

  @ApiProperty({ example: 301 })
  processedMedia!: number;

  @ApiProperty({ example: 7 })
  failedMedia!: number;

  @ApiProperty({ example: 15 })
  processingMedia!: number;

  @ApiProperty({ type: [QueueOverviewItemDto] })
  queues!: QueueOverviewItemDto[];
}
