import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeService implements OnModuleInit {
  private stripe: InstanceType<typeof Stripe>;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.stripe = new Stripe(
      this.config.getOrThrow<string>('STRIPE_SECRET_KEY'),
    );
  }

  get client() {
    return this.stripe;
  }

  verifyWebhookSignature(payload: Buffer, signature: string) {
    const secret = this.config.getOrThrow<string>('STRIPE_WEBHOOK_SECRET');
    return this.stripe.webhooks.constructEvent(payload, signature, secret);
  }

  async createCustomer(params: {
    email: string;
    metadata: Record<string, string>;
  }) {
    return this.stripe.customers.create({
      email: params.email,
      metadata: params.metadata,
    });
  }

  async createCheckoutSession(params: {
    customerId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
    clientReferenceId: string;
  }) {
    return this.stripe.checkout.sessions.create({
      customer: params.customerId,
      mode: 'subscription',
      line_items: [{ price: params.priceId, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: params.metadata,
      client_reference_id: params.clientReferenceId,
      subscription_data: {
        metadata: params.metadata,
      },
    });
  }

  async createPortalSession(params: { customerId: string; returnUrl: string }) {
    const configId = this.config.getOrThrow<string>(
      'STRIPE_PORTAL_CONFIGURATION_ID',
    );
    return this.stripe.billingPortal.sessions.create({
      customer: params.customerId,
      return_url: params.returnUrl,
      configuration: configId,
    });
  }
}
