import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  AvailablePlan,
  CurrentSubscriptionPlan,
  SubscriptionAiCredits,
  SubscriptionQuota,
  SubscriptionStatusResponse,
} from '@kapter/contracts';
import { BillingCycleType } from 'prisma/generated/client';
import { MEDIA_ERRORS } from 'src/common/constants/error-messages';

export class SubscriptionCurrentPlanDto implements CurrentSubscriptionPlan {
  @ApiProperty() planCode!: string;
  @ApiProperty() planName!: string;
  @ApiProperty() variantId!: string;
  @ApiProperty() variantName!: string;
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE', 'EXPIRED'] })
  status!: 'ACTIVE' | 'INACTIVE' | 'EXPIRED';
  @ApiProperty() priceSnapshot!: string;
  @ApiProperty() currency!: string;
  @ApiProperty({ enum: BillingCycleType })
  billingCycleType!: BillingCycleType;
}

export class SubscriptionQuotaStatusDto implements SubscriptionQuota {
  @ApiProperty() usedSeconds!: number;
  @ApiProperty({ nullable: true }) totalSeconds!: number | null;
  @ApiProperty({ nullable: true }) remainingSeconds!: number | null;
  @ApiProperty({ nullable: true }) maxDurationPerFileSeconds!: number | null;
  @ApiProperty() windowStartAt!: string;
  @ApiProperty() windowEndAt!: string;
  @ApiProperty({
    enum: [
      'none',
      MEDIA_ERRORS.SUBSCRIPTION_INACTIVE,
      MEDIA_ERRORS.QUOTA_EXCEEDED,
    ],
  })
  uploadBlockerCode!:
    | 'none'
    | typeof MEDIA_ERRORS.SUBSCRIPTION_INACTIVE
    | typeof MEDIA_ERRORS.QUOTA_EXCEEDED;
}

export class SubscriptionAiCreditsDto implements SubscriptionAiCredits {
  @ApiProperty() remaining!: number;
  @ApiProperty() includedPerCycle!: number;
}

export class AvailablePlanDto implements AvailablePlan {
  @ApiProperty() planCode!: string;
  @ApiProperty() planName!: string;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiProperty({ type: [String] }) features!: string[];
  @ApiPropertyOptional({ nullable: true }) tierLevel!: number | null;
  @ApiProperty() variantId!: string;
  @ApiProperty() variantName!: string;
  @ApiProperty() price!: string;
  @ApiProperty() currency!: string;
  @ApiProperty({ enum: BillingCycleType })
  billingCycleType!: BillingCycleType;
  @ApiProperty({ nullable: true }) monthlyQuotaSeconds!: number | null;
  @ApiProperty({ nullable: true }) maxDurationPerFileSeconds!: number | null;
  @ApiProperty() aiCreditsPerMonth!: number;
  @ApiProperty() isCurrent!: boolean;
}

export class SubscriptionStatusResponseDto implements SubscriptionStatusResponse {
  @ApiPropertyOptional({ type: SubscriptionCurrentPlanDto, nullable: true })
  currentPlan!: SubscriptionCurrentPlanDto | null;

  @ApiProperty({ type: SubscriptionQuotaStatusDto })
  quota!: SubscriptionQuotaStatusDto;

  @ApiProperty({ type: SubscriptionAiCreditsDto })
  aiCredits!: SubscriptionAiCreditsDto;

  @ApiProperty({ type: [AvailablePlanDto] })
  availablePlans!: AvailablePlanDto[];
}
