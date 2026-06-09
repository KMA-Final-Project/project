import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { Public } from 'src/common/decorators/public.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { PrismaService } from 'src/prisma/prisma.service';
import { CatalogService } from './services/catalog.service';
import { CheckoutService } from './services/checkout.service';
import { StripeService } from './services/stripe.service';
import {
  CreateCheckoutSessionDto,
  CreateCheckoutSessionResponseDto,
  CheckoutSessionStatusResponseDto,
} from './dto/checkout.dto';
import {
  CreatePortalSessionDto,
  CreatePortalSessionResponseDto,
} from './dto/portal.dto';

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly checkoutService: CheckoutService,
    private readonly stripeService: StripeService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get('catalog')
  @Public()
  @ApiOperation({ summary: 'Public billing catalog of purchasable variants' })
  async getCatalog() {
    return this.catalogService.getCatalog();
  }

  @Get('status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current billing state for authenticated user' })
  async getBillingStatus(@CurrentUser() user: { id: string }) {
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: {
        currentSubscription: {
          include: {
            variant: { include: { plan: true } },
          },
        },
      },
    });

    if (!dbUser) {
      return {
        hasStripeCustomer: false,
        hasActivePaidSubscription: false,
        stripeCustomerId: null,
        currentSubscription: null,
      };
    }

    const sub = dbUser.currentSubscription;

    return {
      hasStripeCustomer: !!dbUser.stripeCustomerId,
      hasActivePaidSubscription: !!sub?.stripeSubscriptionId,
      stripeCustomerId: dbUser.stripeCustomerId ?? null,
      currentSubscription: sub
        ? {
            variantId: sub.variantId,
            planName: sub.variant?.plan?.name ?? null,
            status: sub.status,
            stripeStatus: sub.stripeStatus ?? null,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
            currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
          }
        : null,
    };
  }

  @Post('checkout-session')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a Stripe Checkout Session for a variant' })
  @ApiResponse({ status: 201, type: CreateCheckoutSessionResponseDto })
  async createCheckoutSession(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateCheckoutSessionDto,
  ) {
    return this.checkoutService.createCheckoutSession(user.id, dto);
  }

  @Get('checkout-sessions/:sessionId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get checkout session status' })
  @ApiResponse({ status: 200, type: CheckoutSessionStatusResponseDto })
  async getCheckoutSessionStatus(
    @CurrentUser() user: { id: string },
    @Param('sessionId') sessionId: string,
  ) {
    const session = await this.prisma.billingCheckoutSession.findFirst({
      where: { id: sessionId, userId: user.id },
    });
    if (!session) {
      throw new BadRequestException('Session not found.');
    }
    return {
      sessionId: session.id,
      status: session.status,
      variantId: session.variantId,
      completedAt: session.completedAt?.toISOString() ?? null,
    };
  }

  @Post('customer-portal-session')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a Stripe Customer Portal session' })
  @ApiResponse({ status: 201, type: CreatePortalSessionResponseDto })
  async createPortalSession(
    @CurrentUser() user: { id: string },
    @Body() dto: CreatePortalSessionDto,
  ) {
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { stripeCustomerId: true },
    });

    if (!dbUser?.stripeCustomerId) {
      throw new BadRequestException(
        'No Stripe customer found. Please subscribe first.',
      );
    }

    const allowed = this.config.get<string>('STRIPE_ALLOWED_ORIGINS', '');
    const origins = allowed
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    if (origins.length > 0) {
      try {
        const parsed = new URL(dto.returnUrl);
        const isAllowed = origins.some((origin) => parsed.origin === origin);
        if (!isAllowed) {
          throw new BadRequestException(
            `URL origin not allowed: ${parsed.origin}`,
          );
        }
      } catch (e) {
        if (e instanceof BadRequestException) throw e;
        throw new BadRequestException(`Invalid URL: ${dto.returnUrl}`);
      }
    }

    const session = await this.stripeService.createPortalSession({
      customerId: dbUser.stripeCustomerId,
      returnUrl: dto.returnUrl,
    });

    return { url: session.url };
  }
}
