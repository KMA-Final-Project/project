import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  CreateVariantPayload,
  UpdateVariantPayload,
} from '@kapter/contracts';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsNumber,
  IsEnum,
  Min,
  MaxLength,
} from 'class-validator';
import { BillingCycleType } from 'prisma/generated/client';

export class CreateVariantDto implements CreateVariantPayload {
  @ApiProperty({ example: 'Monthly', description: 'Variant display name' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({
    example: 99000,
    description: 'Price in smallest currency unit',
  })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ example: 'VND', default: 'VND' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ enum: BillingCycleType, example: 'MONTHLY' })
  @IsEnum(BillingCycleType)
  billingCycleType: BillingCycleType;

  @ApiProperty({
    example: 3600,
    description: 'Max duration per file in seconds',
  })
  @IsInt()
  @Min(60)
  maxDurationPerFile: number;

  @ApiProperty({ example: 72000, description: 'Monthly quota in seconds' })
  @IsInt()
  @Min(0)
  monthlyQuotaSeconds: number;

  @ApiProperty({
    example: 100,
    description: 'Monthly AI credits available for Kapter Explain',
  })
  @IsInt()
  @Min(0)
  aiCreditsPerMonth: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  checkoutEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  stripeProductId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  stripePriceId?: string;
}

export class UpdateVariantDto implements UpdateVariantPayload {
  @ApiPropertyOptional({ example: 'Monthly Updated' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 129000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ example: 'VND' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 7200 })
  @IsOptional()
  @IsInt()
  @Min(60)
  maxDurationPerFile?: number;

  @ApiPropertyOptional({ example: 144000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyQuotaSeconds?: number;

  @ApiPropertyOptional({
    example: 150,
    description: 'Monthly AI credits available for Kapter Explain',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  aiCreditsPerMonth?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  checkoutEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  stripeProductId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  stripePriceId?: string;
}
