import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Subscription } from 'prisma/generated/client';
import { SUBSCRIPTION_ERRORS } from 'src/common/constants/error-messages';

/**
 * Handles subscription lifecycle for users.
 *
 * Design Notes (SaaS Best Practices):
 * - Uses the "Snapshot Pattern": when creating a subscription, the current
 *   plan limits (price, quota, maxDuration) are COPIED into the subscription
 *   record. This protects existing users when admins change plan terms later.
 * - FREE plan lookup is done by `plan.code`, never by hardcoded ID.
 * - All mutations are wrapped in a Prisma transaction for atomicity.
 */
@Injectable()
export class UserSubscriptionService {
  private readonly logger = new Logger(UserSubscriptionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Assigns the default FREE plan to a newly registered user.
   *
   * This method:
   * 1. Finds the active FREE variant by plan code (dynamic lookup)
   * 2. Creates a Subscription with snapshot fields copied from the variant
   * 3. Links the subscription as the user's current active subscription
   *
   * All steps run inside a transaction — a user will never exist without a plan.
   *
   * @param userId - The ID of the newly created user
   * @returns The created Subscription record
   * @throws InternalServerErrorException if the FREE plan/variant is not seeded
   */
  async assignDefaultFreePlan(userId: string): Promise<Subscription> {
    // Step 1: Find the active FREE variant
    const freeVariant = await this.prisma.planVariant.findFirst({
      where: {
        plan: { code: 'free' },
        isActive: true,
      },
      include: { plan: true },
    });

    if (!freeVariant) {
      this.logger.error(
        'DEFAULT FREE PLAN NOT FOUND! Database may not be seeded. ' +
          'Run: pnpm prisma db seed',
      );
      throw new InternalServerErrorException(
        SUBSCRIPTION_ERRORS.DEFAULT_PLAN_UNAVAILABLE,
      );
    }

    // Step 2 & 3: Create subscription + link to user (atomic)
    const now = new Date();
    const farFuture = new Date('9999-12-31T23:59:59.999Z');

    const subscription = await this.prisma.$transaction(async (tx) => {
      // Create subscription with snapshot fields
      const sub = await tx.subscription.create({
        data: {
          userId,
          variantId: freeVariant.id,
          startDate: now,
          endDate: farFuture, // FREE plans never expire
          status: 'ACTIVE',

          // === SNAPSHOT PATTERN ===
          // Copy current variant limits into the subscription record.
          // If admin changes FREE limits tomorrow, this user keeps their
          // original limits from registration time.
          priceSnapshot: freeVariant.price,
          monthlyQuotaSecondsSnapshot: freeVariant.monthlyQuotaSeconds,
          maxDurationPerFileSnapshot: freeVariant.maxDurationPerFile,
          aiCreditsPerMonthSnapshot: freeVariant.aiCreditsPerMonth,
        },
      });

      // Link as the user's current active subscription
      await tx.user.update({
        where: { id: userId },
        data: {
          currentSubscriptionId: sub.id,
          aiCreditsRemaining: freeVariant.aiCreditsPerMonth,
          aiCreditsLastResetDate: now,
        },
      });

      return sub;
    });

    this.logger.log(
      `Assigned FREE plan to user ${userId} (subscription: ${subscription.id})`,
    );

    return subscription;
  }
}
