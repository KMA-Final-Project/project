import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { StripeService } from './stripe.service';
import { BillingCycleType } from 'prisma/generated/client';
import type {
  CreateCheckoutSessionRequest,
  CreateCheckoutSessionResponse,
} from '@kapter/contracts';

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
    private readonly config: ConfigService,
  ) {}

  async createCheckoutSession(
    userId: string,
    dto: CreateCheckoutSessionRequest,
  ): Promise<CreateCheckoutSessionResponse> {
    const variant = await this.prisma.planVariant.findUnique({
      where: { id: dto.variantId },
      include: { plan: true },
    });

    if (!variant) {
      throw new BadRequestException('Variant not found.');
    }
    if (!variant.isActive) {
      throw new BadRequestException('Variant is not active.');
    }
    if (variant.billingCycleType === BillingCycleType.LIFETIME) {
      throw new BadRequestException('Lifetime variants cannot be checked out.');
    }
    if (!variant.checkoutEnabled) {
      throw new BadRequestException(
        'Checkout is not enabled for this variant.',
      );
    }
    if (!variant.stripePriceId) {
      throw new BadRequestException(
        'Variant does not have a Stripe price configured.',
      );
    }
    if (variant.plan.code === 'free') {
      throw new BadRequestException('Cannot checkout the free plan.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { currentSubscription: true },
    });

    if (!user) {
      throw new BadRequestException('User not found.');
    }

    if (user.currentSubscription?.stripeSubscriptionId) {
      throw new BadRequestException(
        'You already have an active paid subscription.',
      );
    }

    this.validateUrlOrigin(dto.successUrl);
    this.validateUrlOrigin(dto.cancelUrl);

    let stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await this.stripeService.createCustomer({
        email: user.email,
        metadata: { userId: user.id },
      });
      stripeCustomerId = customer.id;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId },
      });
    }

    const stripeSession = await this.stripeService.createCheckoutSession({
      customerId: stripeCustomerId,
      priceId: variant.stripePriceId,
      successUrl: dto.successUrl,
      cancelUrl: dto.cancelUrl,
      metadata: { internalUserId: user.id, variantId: variant.id },
      clientReferenceId: user.id,
    });

    const localSession = await this.prisma.billingCheckoutSession.create({
      data: {
        userId: user.id,
        variantId: variant.id,
        stripeSessionId: stripeSession.id,
        stripeCustomerId,
        status: 'PENDING',
        successUrl: dto.successUrl,
        cancelUrl: dto.cancelUrl,
      },
    });

    return {
      checkoutUrl: stripeSession.url!,
      sessionId: localSession.id,
    };
  }

  private validateUrlOrigin(url: string): void {
    const allowedOrigins = this.config
      .get<string>('STRIPE_ALLOWED_ORIGINS', '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);

    if (allowedOrigins.length === 0) {
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException(`Invalid URL: ${url}`);
    }

    const origin = `${parsed.protocol}//${parsed.host}`;
    if (!allowedOrigins.includes(origin)) {
      throw new BadRequestException(`URL origin not allowed: ${origin}`);
    }
  }
}
