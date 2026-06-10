/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { EntitlementSyncService } from './entitlement-sync.service';

describe('EntitlementSyncService', () => {
  function createMocks() {
    const prisma = {
      planVariant: { findFirst: jest.fn(), findUnique: jest.fn() },
      user: { findUnique: jest.fn(), update: jest.fn() },
      subscription: {
        update: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    const stripeService = {
      client: {
        subscriptions: {
          retrieve: jest.fn(),
        },
      },
    };
    const userSubService = { assignDefaultFreePlan: jest.fn() };
    return { prisma, stripeService, userSubService };
  }

  describe('handleSubscriptionDeleted', () => {
    it('marks paid sub cancelled and falls back to FREE', async () => {
      const { prisma, stripeService, userSubService } = createMocks();
      const service = new EntitlementSyncService(
        prisma as never,
        stripeService as never,
        userSubService as never,
      );

      await service.handleSubscriptionDeleted({
        id: 'sub_1',
        metadata: { internalUserId: 'user_1' },
      });

      expect(prisma.subscription.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { stripeSubscriptionId: 'sub_1' },
          data: { status: 'CANCELLED', stripeStatus: 'canceled' },
        }),
      );
      expect(userSubService.assignDefaultFreePlan).toHaveBeenCalledWith(
        'user_1',
      );
    });
  });

  describe('handlePaymentFailed', () => {
    it('marks subscription past_due', async () => {
      const { prisma, stripeService, userSubService } = createMocks();
      const service = new EntitlementSyncService(
        prisma as never,
        stripeService as never,
        userSubService as never,
      );

      await service.handlePaymentFailed({ subscription: 'sub_2' });

      expect(prisma.subscription.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { stripeSubscriptionId: 'sub_2' },
          data: { stripeStatus: 'past_due' },
        }),
      );
    });
  });

  describe('handleInvoicePaid', () => {
    it('replenishes AI credits', async () => {
      const { prisma, stripeService, userSubService } = createMocks();
      prisma.subscription.findFirst.mockResolvedValue({
        userId: 'user_2',
        aiCreditsPerMonthSnapshot: 50,
        variant: { aiCreditsPerMonth: 100 },
      });
      const service = new EntitlementSyncService(
        prisma as never,
        stripeService as never,
        userSubService as never,
      );

      await service.handleInvoicePaid({ subscription: 'sub_3' });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user_2' },
          data: expect.objectContaining({ aiCreditsRemaining: 100 }),
        }),
      );
    });
  });
});
