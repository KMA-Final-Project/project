import { Injectable } from '@nestjs/common';
import { AiCreditReservationState } from 'prisma/generated/client';
import { PrismaService } from 'src/prisma/prisma.service';

export interface ReserveCreditInput {
  userId: string;
  requestType: 'INITIAL_EXPLAIN' | 'FOLLOW_UP';
  idempotencyKey: string;
  mediaId?: string;
  segmentIndex?: number;
  expiresAt?: Date;
}

export interface ReserveCreditResult {
  reserved: boolean;
  remaining: number;
  reservationId?: string;
}

interface UserCreditRow {
  ai_credits_remaining: number;
}

@Injectable()
export class AiCreditLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async reserveCredit(input: ReserveCreditInput): Promise<ReserveCreditResult> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.aiCreditReservation.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: {
          id: true,
          state: true,
          user: { select: { aiCreditsRemaining: true } },
        },
      });

      if (existing) {
        return {
          reserved: existing.state !== AiCreditReservationState.REFUNDED,
          remaining: existing.user.aiCreditsRemaining,
          reservationId: existing.id,
        };
      }

      const [user] = await tx.$queryRaw<UserCreditRow[]>`
        SELECT ai_credits_remaining
        FROM users
        WHERE id = ${input.userId}
        FOR UPDATE
      `;

      if (!user || user.ai_credits_remaining <= 0) {
        return { reserved: false, remaining: 0 };
      }

      await tx.user.update({
        where: { id: input.userId },
        data: { aiCreditsRemaining: { decrement: 1 } },
      });

      const reservation = await tx.aiCreditReservation.create({
        data: {
          userId: input.userId,
          mediaId: input.mediaId,
          segmentIndex: input.segmentIndex,
          requestType: input.requestType,
          idempotencyKey: input.idempotencyKey,
          expiresAt: input.expiresAt ?? new Date(Date.now() + 5 * 60 * 1000),
        },
        select: { id: true },
      });

      return {
        reserved: true,
        remaining: user.ai_credits_remaining - 1,
        reservationId: reservation.id,
      };
    });
  }

  async confirmReservation(reservationId: string): Promise<boolean> {
    const updated = await this.prisma.aiCreditReservation.updateMany({
      where: {
        id: reservationId,
        state: AiCreditReservationState.PENDING,
      },
      data: {
        state: AiCreditReservationState.CONFIRMED,
        confirmedAt: new Date(),
      },
    });

    return updated.count === 1;
  }

  async refundReservation(reservationId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.aiCreditReservation.updateMany({
        where: {
          id: reservationId,
          state: AiCreditReservationState.PENDING,
        },
        data: {
          state: AiCreditReservationState.REFUNDED,
          refundedAt: new Date(),
        },
      });

      if (updated.count === 0) {
        return false;
      }

      const reservation = await tx.aiCreditReservation.findUniqueOrThrow({
        where: { id: reservationId },
        select: {
          userId: true,
          creditsReserved: true,
        },
      });

      await tx.user.update({
        where: { id: reservation.userId },
        data: {
          aiCreditsRemaining: {
            increment: reservation.creditsReserved,
          },
        },
      });

      return true;
    });
  }
}
