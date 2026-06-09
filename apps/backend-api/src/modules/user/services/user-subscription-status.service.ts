import { BadRequestException, Injectable } from '@nestjs/common';
import {
  BillingCycleType,
  Prisma,
  Role,
  SubscriptionStatus,
} from 'prisma/generated/client';
import { MEDIA_ERRORS } from 'src/common/constants/error-messages';
import { PrismaService } from 'src/prisma/prisma.service';
import type { SubscriptionStatusResponseDto } from '../dto';

const UNLIMITED_SENTINEL = 2_147_483_647;

const BILLING_CYCLE_ORDER: Record<BillingCycleType, number> = {
  MONTHLY: 0,
  SIX_MONTHS: 1,
  YEARLY: 2,
  LIFETIME: 3,
};

type UploadBlockerCode =
  | 'none'
  | typeof MEDIA_ERRORS.SUBSCRIPTION_INACTIVE
  | typeof MEDIA_ERRORS.QUOTA_EXCEEDED;

@Injectable()
export class UserSubscriptionStatusService {
  constructor(private readonly prisma: PrismaService) {}

  async getSubscriptionStatus(
    userId: string,
  ): Promise<SubscriptionStatusResponseDto> {
    const now = new Date();
    const windowStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const windowEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        role: true,
        aiCreditsRemaining: true,
        currentSubscriptionId: true,
        currentSubscription: {
          select: {
            id: true,
            status: true,
            endDate: true,
            priceSnapshot: true,
            maxDurationPerFileSnapshot: true,
            monthlyQuotaSecondsSnapshot: true,
            aiCreditsPerMonthSnapshot: true,
            variant: {
              select: {
                id: true,
                name: true,
                currency: true,
                billingCycleType: true,
                plan: {
                  select: {
                    code: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const usedSeconds = await this.getUsedSecondsForWindow(
      userId,
      windowStart,
      windowEnd,
    );

    const currentSubscription = user.currentSubscription;
    const currentPlanStatus = this.resolveCurrentPlanStatus(
      currentSubscription?.status ?? null,
      currentSubscription?.endDate ?? null,
      now,
    );
    const normalizedQuota = this.normalizeLimit(
      currentSubscription?.monthlyQuotaSecondsSnapshot ?? null,
    );
    const normalizedDurationLimit = this.normalizeLimit(
      currentSubscription?.maxDurationPerFileSnapshot ?? null,
    );
    const blockerCode = this.resolveUploadBlockerCode({
      role: user.role,
      currentPlanStatus,
      totalSeconds: normalizedQuota,
      usedSeconds,
    });

    const plans = await this.prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      include: {
        variants: {
          where: { isActive: true },
        },
      },
      orderBy: { tierLevel: 'asc' },
    });

    return {
      currentPlan: currentSubscription
        ? {
            planCode: currentSubscription.variant.plan.code,
            planName: currentSubscription.variant.plan.name,
            variantId: currentSubscription.variant.id,
            variantName: currentSubscription.variant.name,
            status: currentPlanStatus,
            priceSnapshot: currentSubscription.priceSnapshot.toString(),
            currency: currentSubscription.variant.currency,
            billingCycleType: currentSubscription.variant.billingCycleType,
          }
        : null,
      quota: {
        usedSeconds,
        totalSeconds: user.role === Role.ADMIN ? null : normalizedQuota,
        remainingSeconds:
          user.role === Role.ADMIN
            ? null
            : normalizedQuota == null
              ? null
              : Math.max(0, normalizedQuota - usedSeconds),
        maxDurationPerFileSeconds:
          user.role === Role.ADMIN ? null : normalizedDurationLimit,
        windowStartAt: windowStart.toISOString(),
        windowEndAt: windowEnd.toISOString(),
        uploadBlockerCode: blockerCode,
      },
      aiCredits: {
        remaining: user.aiCreditsRemaining,
        includedPerCycle:
          currentSubscription?.aiCreditsPerMonthSnapshot ??
          user.aiCreditsRemaining,
      },
      availablePlans: plans
        .flatMap((plan) =>
          plan.variants.map((variant) => ({
            planCode: plan.code,
            planName: plan.name,
            description: plan.description,
            features: this.normalizeFeatures(plan.features),
            tierLevel: plan.tierLevel,
            variantId: variant.id,
            variantName: variant.name,
            price: variant.price.toString(),
            currency: variant.currency,
            billingCycleType: variant.billingCycleType,
            monthlyQuotaSeconds: this.normalizeLimit(
              variant.monthlyQuotaSeconds,
            ),
            maxDurationPerFileSeconds: this.normalizeLimit(
              variant.maxDurationPerFile,
            ),
            aiCreditsPerMonth: variant.aiCreditsPerMonth,
            isCurrent: variant.id === currentSubscription?.variant.id,
          })),
        )
        .sort((left, right) => {
          const tierDelta = (left.tierLevel ?? 0) - (right.tierLevel ?? 0);
          if (tierDelta !== 0) {
            return tierDelta;
          }

          return (
            BILLING_CYCLE_ORDER[left.billingCycleType] -
            BILLING_CYCLE_ORDER[right.billingCycleType]
          );
        }),
    };
  }

  async getUploadBlockerCode(userId: string): Promise<UploadBlockerCode> {
    const status = await this.getSubscriptionStatus(userId);
    return status.quota.uploadBlockerCode;
  }

  async assertUploadAllowed(userId: string): Promise<void> {
    const blockerCode = await this.getUploadBlockerCode(userId);

    if (blockerCode === MEDIA_ERRORS.SUBSCRIPTION_INACTIVE) {
      throw new BadRequestException(MEDIA_ERRORS.SUBSCRIPTION_INACTIVE);
    }

    if (blockerCode === MEDIA_ERRORS.QUOTA_EXCEEDED) {
      throw new BadRequestException(MEDIA_ERRORS.QUOTA_EXCEEDED);
    }
  }

  private async getUsedSecondsForWindow(
    userId: string,
    windowStart: Date,
    windowEnd: Date,
  ): Promise<number> {
    const usageResult = await this.prisma.mediaItem.aggregate({
      where: {
        userId,
        countedInQuota: true,
        createdAt: {
          gte: windowStart,
          lt: windowEnd,
        },
        deletedAt: null,
      },
      _sum: { durationSeconds: true },
    });

    return usageResult._sum.durationSeconds || 0;
  }

  private normalizeLimit(value: number | null | undefined): number | null {
    if (value == null || value >= UNLIMITED_SENTINEL) {
      return null;
    }

    return value;
  }

  private resolveCurrentPlanStatus(
    status: SubscriptionStatus | null,
    endDate: Date | null,
    now: Date,
  ): 'ACTIVE' | 'INACTIVE' | 'EXPIRED' {
    if (!status) {
      return 'INACTIVE';
    }

    if (status === SubscriptionStatus.EXPIRED) {
      return 'EXPIRED';
    }

    if (status === SubscriptionStatus.CANCELLED) {
      return 'INACTIVE';
    }

    if (endDate && endDate.getTime() < now.getTime()) {
      return 'EXPIRED';
    }

    return 'ACTIVE';
  }

  private resolveUploadBlockerCode(input: {
    role: Role;
    currentPlanStatus: 'ACTIVE' | 'INACTIVE' | 'EXPIRED';
    totalSeconds: number | null;
    usedSeconds: number;
  }): UploadBlockerCode {
    if (input.role === Role.ADMIN) {
      return 'none';
    }

    if (input.currentPlanStatus !== 'ACTIVE') {
      return MEDIA_ERRORS.SUBSCRIPTION_INACTIVE;
    }

    if (input.totalSeconds != null && input.usedSeconds >= input.totalSeconds) {
      return MEDIA_ERRORS.QUOTA_EXCEEDED;
    }

    return 'none';
  }

  private normalizeFeatures(value: Prisma.JsonValue | null): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((entry): entry is string => typeof entry === 'string');
  }
}
