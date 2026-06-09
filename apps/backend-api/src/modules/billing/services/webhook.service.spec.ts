/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { WebhookService } from './webhook.service';

describe('WebhookService', () => {
  describe('handleEvent', () => {
    it('skips already-processed duplicate events', async () => {
      const prisma = {
        billingWebhookEvent: {
          findUnique: jest.fn().mockResolvedValue({ status: 'PROCESSED' }),
          upsert: jest.fn(),
          update: jest.fn(),
        },
      };
      const entitlementSync = {};
      const service = new WebhookService(
        prisma as never,
        entitlementSync as never,
      );

      await service.handleEvent({
        id: 'evt_1',
        type: 'test',
        api_version: null,
        data: { object: {} },
      });

      expect(prisma.billingWebhookEvent.upsert).not.toHaveBeenCalled();
    });

    it('stores and processes new events', async () => {
      const prisma = {
        billingWebhookEvent: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockResolvedValue({ id: 'wh_1' }),
          update: jest.fn(),
        },
      };
      const entitlementSync = {
        syncSubscription: jest.fn(),
      };
      const service = new WebhookService(
        prisma as never,
        entitlementSync as never,
      );

      await service.handleEvent({
        id: 'evt_2',
        type: 'customer.subscription.created',
        api_version: '2025-01-01',
        data: {
          object: {
            id: 'sub_1',
            metadata: { internalUserId: 'u1' },
            items: { data: [{ price: { id: 'price_1' } }] },
          },
        },
      });

      expect(prisma.billingWebhookEvent.upsert).toHaveBeenCalled();
      expect(entitlementSync.syncSubscription).toHaveBeenCalled();
      expect(prisma.billingWebhookEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PROCESSED' }),
        }),
      );
    });

    it('marks event as FAILED on processing error and rethrows', async () => {
      const prisma = {
        billingWebhookEvent: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockResolvedValue({ id: 'wh_2' }),
          update: jest.fn(),
        },
      };
      const entitlementSync = {
        syncSubscription: jest.fn().mockRejectedValue(new Error('DB error')),
      };
      const service = new WebhookService(
        prisma as never,
        entitlementSync as never,
      );

      await expect(
        service.handleEvent({
          id: 'evt_3',
          type: 'customer.subscription.created',
          api_version: null,
          data: { object: { metadata: {}, items: { data: [] } } },
        }),
      ).rejects.toThrow('DB error');

      expect(prisma.billingWebhookEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'FAILED',
            failureMessage: 'DB error',
          }),
        }),
      );
    });
  });
});
