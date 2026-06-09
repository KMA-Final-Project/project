/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  Controller,
  Post,
  Req,
  Headers,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Public } from 'src/common/decorators/public.decorator';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { StripeService } from './services/stripe.service';
import { WebhookService } from './services/webhook.service';

@Controller('billing')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly webhookService: WebhookService,
  ) {}

  @Post('webhooks/stripe')
  @Public()
  @HttpCode(HttpStatus.OK)
  async handleStripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!req.rawBody) {
      throw new BadRequestException('Raw body not available.');
    }

    let event;
    try {
      event = this.stripeService.verifyWebhookSignature(req.rawBody, signature);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Webhook signature verification failed: ${message}`);
      throw new BadRequestException('Invalid webhook signature.');
    }

    await this.webhookService.handleEvent(event);
    return { received: true };
  }
}
