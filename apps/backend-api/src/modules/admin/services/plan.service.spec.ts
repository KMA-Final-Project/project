import { PlanService } from './plan.service';

describe('PlanService', () => {
  describe('findByIdWithMetrics', () => {
    it('returns plan with variant metrics', async () => {
      const now = new Date();
      const prisma = {
        subscriptionPlan: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'FREE',
            code: 'FREE',
            name: 'Free',
            description: null,
            features: null,
            tierLevel: 1,
            isActive: true,
            createdAt: now,
            updatedAt: now,
            variants: [
              {
                id: 'v1',
                planId: 'FREE',
                isActive: true,
                price: 0,
                billingCycleType: 'MONTHLY',
                name: 'Free',
                currency: 'VND',
                maxDurationPerFile: 300,
                monthlyQuotaSeconds: 1800,
                aiCreditsPerMonth: 0,
                createdAt: now,
                updatedAt: now,
              },
            ],
          }),
        },
        user: { count: jest.fn().mockResolvedValue(3) },
        subscription: { count: jest.fn().mockResolvedValue(5) },
      };
      const service = new PlanService(prisma as never);

      const result = await service.findByIdWithMetrics('FREE');

      expect(result.totalVariants).toBe(1);
      expect(result.activeVariants).toBe(1);
      expect(result.activeCurrentSubscribers).toBe(3);
      expect(result.historicalSubscriptions).toBe(5);
      expect(
        result.variants[0].subscriptionMetrics.activeCurrentSubscribers,
      ).toBe(3);
      expect(
        result.variants[0].subscriptionMetrics.historicalSubscriptions,
      ).toBe(5);
    });

    it('throws NotFoundException for missing plan', async () => {
      const prisma = {
        subscriptionPlan: { findUnique: jest.fn().mockResolvedValue(null) },
      };
      const service = new PlanService(prisma as never);

      await expect(service.findByIdWithMetrics('MISSING')).rejects.toThrow(
        'not found',
      );
    });
  });
});
