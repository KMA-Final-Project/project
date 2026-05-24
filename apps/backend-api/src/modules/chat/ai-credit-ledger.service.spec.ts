import { AiCreditReservationState } from 'prisma/generated/client';
import { AiCreditLedgerService } from './ai-credit-ledger.service';

describe('AiCreditLedgerService', () => {
  it('refunds a pending reservation exactly once', async () => {
    const tx = {
      aiCreditReservation: {
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 0 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          userId: 'user-1',
          creditsReserved: 1,
        }),
      },
      user: {
        update: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (arg: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new AiCreditLedgerService(prisma as never);

    await expect(service.refundReservation('reservation-1')).resolves.toBe(
      true,
    );
    await expect(service.refundReservation('reservation-1')).resolves.toBe(
      false,
    );

    expect(tx.user.update).toHaveBeenCalledTimes(1);
    expect(tx.aiCreditReservation.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'reservation-1',
        state: AiCreditReservationState.PENDING,
      },
      data: {
        state: AiCreditReservationState.REFUNDED,
        refundedAt: expect.any(Date) as Date,
      },
    });
  });

  it('does not double-decrement credits when an idempotency key already exists', async () => {
    const tx = {
      aiCreditReservation: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'reservation-1',
          state: AiCreditReservationState.PENDING,
          user: { aiCreditsRemaining: 9 },
        }),
      },
      user: {
        update: jest.fn(),
      },
      $queryRaw: jest.fn(),
    };
    const prisma = {
      $transaction: jest.fn((callback: (arg: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new AiCreditLedgerService(prisma as never);

    await expect(
      service.reserveCredit({
        userId: 'user-1',
        requestType: 'INITIAL_EXPLAIN',
        idempotencyKey: 'media-1:12:v3',
      }),
    ).resolves.toEqual({
      reserved: true,
      remaining: 9,
      reservationId: 'reservation-1',
    });

    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});
