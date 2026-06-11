/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { CatalogService } from './catalog.service';

describe('CatalogService', () => {
  describe('getCatalog', () => {
    it('returns only active, checkout-enabled, mapped, non-FREE, non-LIFETIME variants', async () => {
      const variants = [
        {
          id: 'v1',
          name: 'Monthly',
          price: 99000,
          currency: 'VND',
          billingCycleType: 'MONTHLY',
          monthlyQuotaSeconds: 72000,
          maxDurationPerFile: 3600,
          aiCreditsPerMonth: 10,
          isActive: true,
          plan: { code: 'pro', name: 'Pro', tierLevel: 2 },
        },
      ];
      const prisma = {
        planVariant: { findMany: jest.fn().mockResolvedValue(variants) },
      };
      const service = new CatalogService(prisma as never);

      const result = await service.getCatalog();

      expect(result).toHaveLength(1);
      expect(result[0].planCode).toBe('pro');
      expect(result[0].price).toBe('99000');

      const where = prisma.planVariant.findMany.mock.calls[0][0].where;
      expect(where.checkoutEnabled).toBe(true);
      expect(where.billingCycleType.not).toBe('LIFETIME');
      expect(where.plan.code.not).toBe('free');
    });

    it('returns empty array when no eligible variants', async () => {
      const prisma = {
        planVariant: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const service = new CatalogService(prisma as never);

      const result = await service.getCatalog();
      expect(result).toHaveLength(0);
    });
  });
});
