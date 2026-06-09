import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  AdminUsersQueryParams,
  UpdateAdminUserRolePayload,
  AdminUserRoleUpdateResult,
  UserRole,
} from '@kapter/contracts';
import { IsInt, IsOptional, Min, Max, IsString, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export class AdminUsersQueryDto implements AdminUsersQueryParams {
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

  @ApiPropertyOptional({ enum: ['USER', 'ADMIN'] })
  @IsOptional()
  @IsEnum(['USER', 'ADMIN'])
  role?: UserRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  planId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  variantId?: string;
}

export class AdminUserListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty() role!: string;
  @ApiProperty() emailVerified!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiPropertyOptional() currentPlanName?: string | null;
  @ApiPropertyOptional() currentPlanCode?: string | null;
  @ApiPropertyOptional() subscriptionStatus?: string | null;
  @ApiProperty() quotaUsageCurrentMonthSeconds!: number;
}

export class AdminUserListResponseDto {
  @ApiProperty({ type: [AdminUserListItemDto] })
  data!: AdminUserListItemDto[];

  @ApiProperty({ example: 42 }) total!: number;
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty({ example: 20 }) limit!: number;
}

export class AdminUserSubscriptionSnapshotDto {
  @ApiProperty() id!: string;
  @ApiProperty() status!: string;
  @ApiProperty() startDate!: Date;
  @ApiProperty() endDate!: Date;
  @ApiProperty() priceSnapshot!: string;
  @ApiProperty() monthlyQuotaSecondsSnapshot!: number;
  @ApiProperty() maxDurationPerFileSnapshot!: number;
  @ApiPropertyOptional() variantName?: string | null;
  @ApiPropertyOptional() planName?: string | null;
  @ApiPropertyOptional() planCode?: string | null;
  @ApiPropertyOptional() billingCycleType?: string | null;
}

export class AdminUserUsageHistoryItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() cycleStartDate!: Date;
  @ApiProperty() cycleEndDate!: Date;
  @ApiProperty() totalSecondsUsed!: number;
  @ApiProperty() quotaLimitAtThatTime!: number;
}

export class AdminUserDetailDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty() role!: string;
  @ApiProperty() emailVerified!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiProperty() quotaUsageCurrentMonthSeconds!: number;
  @ApiPropertyOptional({ type: AdminUserSubscriptionSnapshotDto })
  currentSubscription?: AdminUserSubscriptionSnapshotDto | null;
  @ApiProperty({ type: [AdminUserUsageHistoryItemDto] })
  recentUsageHistory!: AdminUserUsageHistoryItemDto[];
  @ApiProperty() totalMediaItems!: number;
}

export class UpdateAdminUserRoleDto implements UpdateAdminUserRolePayload {
  @ApiProperty({ enum: ['USER', 'ADMIN'] })
  @IsEnum(['USER', 'ADMIN'])
  role!: UserRole;
}

export class AdminUserRoleUpdateResultDto implements AdminUserRoleUpdateResult {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['USER', 'ADMIN'] }) role!: UserRole;
  @ApiProperty() updatedAt!: string;
}
