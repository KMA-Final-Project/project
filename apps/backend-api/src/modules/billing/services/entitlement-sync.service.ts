/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { UserSubscriptionService } from '../../user/services/user-subscription.service';
import { SubscriptionStatus } from 'prisma/generated/client';

@Injectable()
export class EntitlementSyncService {
  private readonly logger = new Logger(EntitlementSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly userSubService: UserSubscriptionService,
  ) {}

  async syncSubscription(stripeSub: any): Promise<void> {
    const userId = stripeSub.metadata?.internalUserId;
    if (!userId) {
      this.logger.warn(
        `No internalUserId in subscription metadata ${stripeSub.id}`,
      );
      return;
    }

    const stripePriceId = stripeSub.items?.data?.[0]?.price?.id;
    if (!stripePriceId) {
      this.logger.warn(`No price in subscription ${stripeSub.id}`);
      return;
    }

    // Find the internal variant mapped to this Stripe price
    const variant = await this.prisma.planVariant.findFirst({
      where: { stripePriceId },
      include: { plan: true },
    });
    if (!variant) {
      this.logger.warn(`No variant mapped to Stripe price ${stripePriceId}`);
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { currentSubscription: true },
    });
    if (!user) return;

    const currentSub = user.currentSubscription;
    const isSameVariant = currentSub?.variantId === variant.id;

    if (isSameVariant && currentSub?.stripeSubscriptionId) {
      // Same variant renewal — update existing row
      await this.prisma.subscription.update({
        where: { id: currentSub.id },
        data: {
          stripeStatus: stripeSub.status,
          currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
          currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
          cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
          status: this.mapStripeStatus(stripeSub.status),
        },
      });
    } else {
      // New subscription or variant change — create new snapshot row
      await this.activatePaidSubscription(userId, variant.id, stripeSub);
    }

    // Update Stripe customer linkage
    await this.prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId: stripeSub.customer as string },
    });
  }

  async handleInvoicePaid(invoice: any): Promise<void> {
    const stripeSubId = invoice.subscription;
    if (!stripeSubId) return;

    const sub = await this.prisma.subscription.findFirst({
      where: { stripeSubscriptionId: stripeSubId },
      include: { variant: true },
    });
    if (!sub) return;

    // Replenish AI credits
    await this.prisma.user.update({
      where: { id: sub.userId },
      data: {
        aiCreditsRemaining:
          sub.variant?.aiCreditsPerMonth ?? sub.aiCreditsPerMonthSnapshot,
        aiCreditsLastResetDate: new Date(),
      },
    });

    this.logger.log(
      `Invoice paid for subscription ${stripeSubId}, credits replenished.`,
    );
  }

  async handlePaymentFailed(invoice: any): Promise<void> {
    const stripeSubId = invoice.subscription;
    if (!stripeSubId) return;

    await this.prisma.subscription.updateMany({
      where: { stripeSubscriptionId: stripeSubId },
      data: { stripeStatus: 'past_due' },
    });

    this.logger.log(
      `Payment failed for subscription ${stripeSubId}, marked past_due.`,
    );
  }

  async handleSubscriptionDeleted(stripeSub: any): Promise<void> {
    const userId = stripeSub.metadata?.internalUserId;
    if (!userId) {
      this.logger.warn(
        `No internalUserId in deleted subscription ${stripeSub.id}`,
      );
      return;
    }

    // Mark paid subscription as ended
    await this.prisma.subscription.updateMany({
      where: { stripeSubscriptionId: stripeSub.id },
      data: { status: SubscriptionStatus.CANCELLED, stripeStatus: 'canceled' },
    });

    // Fallback to FREE
    await this.userSubService.assignDefaultFreePlan(userId);

    this.logger.log(
      `Subscription ${stripeSub.id} deleted, user ${userId} fell back to FREE.`,
    );
  }

  private async activatePaidSubscription(
    userId: string,
    variantId: string,
    stripeSub: any,
  ): Promise<void> {
    const variant = await this.prisma.planVariant.findUnique({
      where: { id: variantId },
    });
    if (!variant) return;

    const now = new Date();

    // End the current subscription if it exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { currentSubscriptionId: true },
    });
    if (user?.currentSubscriptionId) {
      await this.prisma.subscription.update({
        where: { id: user.currentSubscriptionId },
        data: { status: SubscriptionStatus.EXPIRED, endDate: now },
      });
    }

    // Create new paid subscription snapshot
    const subscription = await this.prisma.subscription.create({
      data: {
        userId,
        variantId,
        startDate: now,
        endDate: new Date(stripeSub.current_period_end * 1000),
        status: SubscriptionStatus.ACTIVE,
        priceSnapshot: variant.price,
        monthlyQuotaSecondsSnapshot: variant.monthlyQuotaSeconds,
        maxDurationPerFileSnapshot: variant.maxDurationPerFile,
        aiCreditsPerMonthSnapshot: variant.aiCreditsPerMonth,
        stripeSubscriptionId: stripeSub.id,
        stripePriceId: stripeSub.items?.data?.[0]?.price?.id,
        stripeStatus: stripeSub.status,
        currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
        cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
      },
    });

    // Update user
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        currentSubscriptionId: subscription.id,
        aiCreditsRemaining: variant.aiCreditsPerMonth,
        aiCreditsLastResetDate: now,
      },
    });

    this.logger.log(
      `Activated paid subscription for user ${userId}, variant ${variantId}.`,
    );
  }

  private mapStripeStatus(stripeStatus: string): SubscriptionStatus {
    switch (stripeStatus) {
      case 'active':
        return SubscriptionStatus.ACTIVE;
      case 'past_due':
      case 'unpaid':
        return SubscriptionStatus.ACTIVE; // Keep entitlements during payment issues
      case 'canceled':
      case 'incomplete_expired':
        return SubscriptionStatus.CANCELLED;
      default:
        return SubscriptionStatus.ACTIVE;
    }
  }
}
