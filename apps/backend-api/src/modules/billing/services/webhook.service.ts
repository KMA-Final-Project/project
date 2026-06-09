/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { EntitlementSyncService } from './entitlement-sync.service';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlementSync: EntitlementSyncService,
  ) {}

  async handleEvent(event: {
    id: string;
    type: string;
    api_version: string | null;
    data: { object: any };
  }): Promise<void> {
    const existing = await this.prisma.billingWebhookEvent.findUnique({
      where: { stripeEventId: event.id },
    });
    if (existing?.status === 'PROCESSED') {
      this.logger.log(`Duplicate event ${event.id}, skipping.`);
      return;
    }

    const webhookEvent = await this.prisma.billingWebhookEvent.upsert({
      where: { stripeEventId: event.id },
      create: {
        stripeEventId: event.id,
        type: event.type,
        apiVersion: event.api_version ?? null,
        rawPayload: event as any,
        status: 'RECEIVED',
      },
      update: { status: 'RECEIVED', failureMessage: null },
    });

    try {
      await this.processEvent(event);
      await this.prisma.billingWebhookEvent.update({
        where: { id: webhookEvent.id },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to process event ${event.id}: ${message}`);
      await this.prisma.billingWebhookEvent.update({
        where: { id: webhookEvent.id },
        data: { status: 'FAILED', failureMessage: message },
      });
      throw err; // Rethrow so controller returns 500 and Stripe retries
    }
  }

  private async processEvent(event: {
    id: string;
    type: string;
    data: { object: any };
  }): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object);
        break;
      case 'checkout.session.expired':
        await this.handleCheckoutExpired(event.data.object);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.entitlementSync.syncSubscription(event.data.object);
        break;
      case 'invoice.paid':
        await this.entitlementSync.handleInvoicePaid(event.data.object);
        break;
      case 'invoice.payment_failed':
        await this.entitlementSync.handlePaymentFailed(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await this.entitlementSync.handleSubscriptionDeleted(event.data.object);
        break;
      default:
        this.logger.log(`Unhandled event type: ${event.type}`);
    }
  }

  private async handleCheckoutCompleted(session: {
    id: string;
  }): Promise<void> {
    const localSession = await this.prisma.billingCheckoutSession.findFirst({
      where: { stripeSessionId: session.id },
    });
    if (!localSession) {
      this.logger.warn(`No local session for Stripe session ${session.id}`);
      return;
    }

    await this.prisma.billingCheckoutSession.update({
      where: { id: localSession.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
  }

  private async handleCheckoutExpired(session: { id: string }): Promise<void> {
    const localSession = await this.prisma.billingCheckoutSession.findFirst({
      where: { stripeSessionId: session.id },
    });
    if (localSession) {
      await this.prisma.billingCheckoutSession.update({
        where: { id: localSession.id },
        data: { status: 'EXPIRED' },
      });
    }
  }
}
