import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsArray,
  Min,
  MaxLength,
} from 'class-validator';

export class CreatePlanDto {
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

export class UpdatePlanDto {
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
