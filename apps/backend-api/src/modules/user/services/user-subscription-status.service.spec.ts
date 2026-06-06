import {
  BillingCycleType,
  Role,
  SubscriptionStatus,
} from 'prisma/generated/client';
import { MEDIA_ERRORS } from 'src/common/constants/error-messages';
import { UserSubscriptionStatusService } from './user-subscription-status.service';

describe('UserSubscriptionStatusService', () => {
  it('returns a quota blocker when the current month usage is exhausted', async () => {
    const prisma = {
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          role: Role.USER,
          aiCreditsRemaining: 3,
          currentSubscriptionId: 'sub-1',
          currentSubscription: {
            id: 'sub-1',
            status: SubscriptionStatus.ACTIVE,
            endDate: new Date('9999-12-31T00:00:00.000Z'),
            priceSnapshot: { toString: () => '0.00' },
            maxDurationPerFileSnapshot: 1800,
            monthlyQuotaSecondsSnapshot: 600,
            aiCreditsPerMonthSnapshot: 10,
            variant: {
              id: 'variant-free',
              name: 'Free Monthly',
              currency: 'VND',
              billingCycleType: BillingCycleType.MONTHLY,
              plan: {
                code: 'free',
                name: 'Free',
              },
            },
          },
        }),
      },
      mediaItem: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { durationSeconds: 600 },
        }),
      },
      subscriptionPlan: {
        findMany: jest.fn().mockResolvedValue([
          {
            code: 'free',
            name: 'Free',
            description: 'Starter tier',
            features: ['Basic subtitles'],
            tierLevel: 1,
            variants: [
              {
                id: 'variant-free',
                name: 'Free Monthly',
                price: { toString: () => '0.00' },
                currency: 'VND',
                billingCycleType: BillingCycleType.MONTHLY,
                monthlyQuotaSeconds: 600,
                maxDurationPerFile: 1800,
                aiCreditsPerMonth: 10,
              },
            ],
          },
        ]),
      },
    };
    const service = new UserSubscriptionStatusService(prisma as never);

    const response = await service.getSubscriptionStatus('user-1');

    expect(response.currentPlan).toMatchObject({
      planCode: 'free',
      variantId: 'variant-free',
      status: 'ACTIVE',
    });
    expect(response.quota).toMatchObject({
      usedSeconds: 600,
      totalSeconds: 600,
      remainingSeconds: 0,
      uploadBlockerCode: MEDIA_ERRORS.QUOTA_EXCEEDED,
    });
    expect(response.availablePlans[0]).toMatchObject({
      isCurrent: true,
      monthlyQuotaSeconds: 600,
    });
  });

  it('treats missing subscriptions as inactive and normalizes unlimited plan limits', async () => {
    const prisma = {
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          role: Role.USER,
          aiCreditsRemaining: 0,
          currentSubscriptionId: null,
          currentSubscription: null,
        }),
      },
      mediaItem: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { durationSeconds: 120 },
        }),
      },
      subscriptionPlan: {
        findMany: jest.fn().mockResolvedValue([
          {
            code: 'pro',
            name: 'Pro',
            description: null,
            features: ['Unlimited uploads'],
            tierLevel: 2,
            variants: [
              {
                id: 'variant-pro',
                name: 'Pro Lifetime',
                price: { toString: () => '99.00' },
                currency: 'VND',
                billingCycleType: BillingCycleType.LIFETIME,
                monthlyQuotaSeconds: 2_147_483_647,
                maxDurationPerFile: 2_147_483_647,
                aiCreditsPerMonth: 100,
              },
            ],
          },
        ]),
      },
    };
    const service = new UserSubscriptionStatusService(prisma as never);

    const response = await service.getSubscriptionStatus('user-2');

    expect(response.currentPlan).toBeNull();
    expect(response.quota.uploadBlockerCode).toBe(
      MEDIA_ERRORS.SUBSCRIPTION_INACTIVE,
    );
    expect(response.availablePlans[0]).toMatchObject({
      monthlyQuotaSeconds: null,
      maxDurationPerFileSeconds: null,
      isCurrent: false,
    });
  });
});
