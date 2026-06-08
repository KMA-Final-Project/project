import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  CreatePlanPayload,
  UpdatePlanPayload,
  AdminPlanDetail,
  AdminPlanVariantDetail,
  AdminPlanSubscriptionMetrics,
  BillingCycleType,
} from '@kapter/contracts';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsArray,
  Min,
  MaxLength,
} from 'class-validator';

export class CreatePlanDto implements CreatePlanPayload {
  @ApiProperty({ example: 'PRO', description: 'Unique plan ID' })
  @IsString()
  @MaxLength(50)
  id: string;

  @ApiProperty({
    example: 'pro',
    description: 'Unique plan code (URL-friendly)',
  })
  @IsString()
  @MaxLength(50)
  code: string;

  @ApiProperty({ example: 'Pro Plan', description: 'Display name' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'Our most popular plan' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: ['No ads', 'Priority support', 'Fast processing'],
    description: 'List of features for marketing display',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @ApiPropertyOptional({
    example: 2,
    description: 'Tier level for ordering (1=lowest)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  tierLevel?: number;
}

export class UpdatePlanDto implements UpdatePlanPayload {
  @ApiPropertyOptional({ example: 'Pro Plan Updated' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'Updated description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: ['Feature 1', 'Feature 2'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  tierLevel?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AdminPlanSubscriptionMetricsDto implements AdminPlanSubscriptionMetrics {
  @ApiProperty({ example: 5 })
  activeCurrentSubscribers!: number;

  @ApiProperty({ example: 12 })
  historicalSubscriptions!: number;
}

export class AdminPlanVariantDetailDto implements AdminPlanVariantDetail {
  @ApiProperty() id!: string;
  @ApiProperty() planId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() price!: string;
  @ApiProperty() currency!: string;
  @ApiProperty() billingCycleType!: BillingCycleType;
  @ApiProperty() maxDurationPerFile!: number;
  @ApiProperty() monthlyQuotaSeconds!: number;
  @ApiProperty() aiCreditsPerMonth!: number;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
  @ApiProperty({ type: AdminPlanSubscriptionMetricsDto })
  subscriptionMetrics!: AdminPlanSubscriptionMetricsDto;
}

export class AdminPlanDetailDto implements AdminPlanDetail {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description!: string | null;
  @ApiPropertyOptional({ type: [String] }) features!: string[] | null;
  @ApiProperty() tierLevel!: number;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
  @ApiProperty() totalVariants!: number;
  @ApiProperty() activeVariants!: number;
  @ApiProperty() activeCurrentSubscribers!: number;
  @ApiProperty() historicalSubscriptions!: number;
  @ApiProperty({ type: [AdminPlanVariantDetailDto] })
  variants!: AdminPlanVariantDetailDto[];
}
