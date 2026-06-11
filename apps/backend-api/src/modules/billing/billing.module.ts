import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { StripeService } from './services/stripe.service';
import { CatalogService } from './services/catalog.service';
import { CheckoutService } from './services/checkout.service';
import { WebhookService } from './services/webhook.service';
import { EntitlementSyncService } from './services/entitlement-sync.service';
import { BillingController } from './billing.controller';
import { WebhookController } from './webhook.controller';
import { UserSubscriptionService } from '../user/services/user-subscription.service';

@Module({
  providers: [
    PrismaService,
    StripeService,
    CatalogService,
    CheckoutService,
    WebhookService,
    EntitlementSyncService,
    UserSubscriptionService,
  ],
  controllers: [BillingController, WebhookController],
  exports: [StripeService, CatalogService, CheckoutService],
})
export class BillingModule {}
