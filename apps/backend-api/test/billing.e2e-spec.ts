/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StripeService } from '../src/modules/billing/services/stripe.service';

describe('Billing Module (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let userToken: string;
  let proVariantId: string;
  let freeVariantId: string;
  let lifetimeVariantId: string;
  let stripeService: StripeService;
  let originalCreateCheckoutSession: typeof stripeService.createCheckoutSession;
  let originalCreateCustomer: typeof stripeService.createCustomer;
  let originalCreatePortalSession: typeof stripeService.createPortalSession;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['/'] });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    stripeService = app.get(StripeService);

    // Save original Stripe methods
    originalCreateCheckoutSession = stripeService.createCheckoutSession;
    originalCreateCustomer = stripeService.createCustomer;
    originalCreatePortalSession = stripeService.createPortalSession;

    // Mock Stripe methods globally
    stripeService.createCustomer = jest.fn().mockResolvedValue({
      id: 'cus_test_e2e_global',
      email: 'test@kapter.local',
    });
    stripeService.createCheckoutSession = jest.fn().mockResolvedValue({
      id: 'cs_test_e2e_global',
      url: 'https://checkout.stripe.com/test_session',
    });
    stripeService.createPortalSession = jest.fn().mockResolvedValue({
      url: 'https://billing.stripe.com/test_portal',
    });

    // Get admin token
    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@kapter.local', password: 'Test@123' });
    adminToken = adminLogin.body.tokens.accessToken;

    // Get free user token
    const freeLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'free.user@kapter.local', password: 'Test@123' });
    userToken = freeLogin.body.tokens.accessToken;

    // Get variant IDs from seed data
    const proVariant = await prisma.planVariant.findFirst({
      where: { planId: 'PRO', billingCycleType: 'MONTHLY' },
    });
    proVariantId = proVariant!.id;

    const freeVariant = await prisma.planVariant.findFirst({
      where: { planId: 'FREE' },
    });
    freeVariantId = freeVariant!.id;

    const lifetimeVariant = await prisma.planVariant.findFirst({
      where: { planId: 'PRO', billingCycleType: 'LIFETIME' },
    });
    lifetimeVariantId = lifetimeVariant!.id;

    // Cleanup any leftover test data
    await prisma.billingCheckoutSession.deleteMany({
      where: { stripeSessionId: { startsWith: 'cs_test_' } },
    });
    await prisma.billingWebhookEvent.deleteMany({
      where: { stripeEventId: { startsWith: 'evt_test_' } },
    });
  });

  afterAll(async () => {
    // Restore original Stripe methods
    stripeService.createCheckoutSession = originalCreateCheckoutSession;
    stripeService.createCustomer = originalCreateCustomer;
    stripeService.createPortalSession = originalCreatePortalSession;

    // Cleanup test data
    await prisma.billingCheckoutSession.deleteMany({
      where: { stripeSessionId: { startsWith: 'cs_test_' } },
    });
    await prisma.billingWebhookEvent.deleteMany({
      where: { stripeEventId: { startsWith: 'evt_test_' } },
    });

    await app.close();
  });

  // ==================== CATALOG ====================

  describe('GET /api/billing/catalog', () => {
    it('returns empty catalog when no variants have checkoutEnabled', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/billing/catalog')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    });

    it('returns variant after enabling checkout', async () => {
      await request(app.getHttpServer())
        .patch(`/api/admin/variants/${proVariantId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          checkoutEnabled: true,
          stripeProductId: 'prod_test_123',
          stripePriceId: 'price_test_456',
        })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/billing/catalog')
        .expect(200);

      expect(res.body.length).toBe(1);
      expect(res.body[0].variantId).toBe(proVariantId);
      expect(res.body[0].price).toBe('99000');
      expect(res.body[0].currency).toBe('VND');

      // Cleanup
      await request(app.getHttpServer())
        .patch(`/api/admin/variants/${proVariantId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          checkoutEnabled: false,
          stripeProductId: null,
          stripePriceId: null,
        });
    });

    it('excludes LIFETIME variants even when checkoutEnabled', async () => {
      await request(app.getHttpServer())
        .patch(`/api/admin/variants/${lifetimeVariantId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          checkoutEnabled: true,
          stripeProductId: 'prod_test_lifetime',
          stripePriceId: 'price_test_lifetime',
        })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/billing/catalog')
        .expect(200);

      const lifetimeInCatalog = res.body.find(
        (item: { variantId: string }) => item.variantId === lifetimeVariantId,
      );
      expect(lifetimeInCatalog).toBeUndefined();

      await request(app.getHttpServer())
        .patch(`/api/admin/variants/${lifetimeVariantId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          checkoutEnabled: false,
          stripeProductId: null,
          stripePriceId: null,
        });
    });

    it('excludes FREE variants', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/billing/catalog')
        .expect(200);

      const freeInCatalog = res.body.find(
        (item: { planCode: string }) => item.planCode === 'free',
      );
      expect(freeInCatalog).toBeUndefined();
    });
  });

  // ==================== BILLING STATUS ====================

  describe('GET /api/billing/status', () => {
    it('returns billing status for FREE user without Stripe customer', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/billing/status')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.body.hasStripeCustomer).toBe(false);
      expect(res.body.hasActivePaidSubscription).toBe(false);
      expect(res.body.stripeCustomerId).toBeNull();
      expect(res.body.currentSubscription).toBeDefined();
      expect(res.body.currentSubscription.status).toBe('ACTIVE');
    });

    it('returns billing status for admin user', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/billing/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.hasStripeCustomer).toBe(false);
      expect(res.body.hasActivePaidSubscription).toBe(false);
      expect(res.body.currentSubscription).toBeDefined();
    });

    it('rejects unauthenticated request', async () => {
      await request(app.getHttpServer()).get('/api/billing/status').expect(401);
    });
  });

  // ==================== ADMIN VARIANT BILLING CONFIG ====================

  describe('Admin variant billing config', () => {
    it('rejects checkoutEnabled without stripeProductId', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/admin/variants/${proVariantId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          checkoutEnabled: true,
          stripePriceId: 'price_test',
        })
        .expect(400);

      expect(res.body.message).toContain('checkoutEnabled');
    });

    it('rejects checkoutEnabled without stripePriceId', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/admin/variants/${proVariantId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          checkoutEnabled: true,
          stripeProductId: 'prod_test',
        })
        .expect(400);

      expect(res.body.message).toContain('checkoutEnabled');
    });

    it('allows setting billing config with all required fields', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/admin/variants/${proVariantId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          checkoutEnabled: true,
          stripeProductId: 'prod_test_e2e',
          stripePriceId: 'price_test_e2e',
        })
        .expect(200);

      expect(res.body.checkoutEnabled).toBe(true);
      expect(res.body.stripeProductId).toBe('prod_test_e2e');
      expect(res.body.stripePriceId).toBe('price_test_e2e');

      await request(app.getHttpServer())
        .patch(`/api/admin/variants/${proVariantId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          checkoutEnabled: false,
          stripeProductId: null,
          stripePriceId: null,
        });
    });

    it('rejects unauthenticated admin request', async () => {
      await request(app.getHttpServer())
        .patch(`/api/admin/variants/${proVariantId}`)
        .send({ checkoutEnabled: true })
        .expect(401);
    });
  });

  // ==================== CHECKOUT SESSION ====================

  describe('POST /api/billing/checkout-session', () => {
    beforeAll(async () => {
      await request(app.getHttpServer())
        .patch(`/api/admin/variants/${proVariantId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          checkoutEnabled: true,
          stripeProductId: 'prod_test_checkout',
          stripePriceId: 'price_test_checkout',
        });
    });

    afterAll(async () => {
      await request(app.getHttpServer())
        .patch(`/api/admin/variants/${proVariantId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          checkoutEnabled: false,
          stripeProductId: null,
          stripePriceId: null,
        });
    });

    it('rejects FREE variant', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/billing/checkout-session')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          variantId: freeVariantId,
          successUrl: 'http://localhost:5173/success',
          cancelUrl: 'http://localhost:5173/cancel',
        })
        .expect(400);

      // FREE variant has checkoutEnabled=false, so the error is about checkout not enabled
      expect(res.body.message).toBeDefined();
    });

    it('rejects LIFETIME variant', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/billing/checkout-session')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          variantId: lifetimeVariantId,
          successUrl: 'http://localhost:5173/success',
          cancelUrl: 'http://localhost:5173/cancel',
        })
        .expect(400);

      expect(res.body.message).toContain('Lifetime');
    });

    it('rejects variant without Stripe mapping', async () => {
      const basicVariant = await prisma.planVariant.findFirst({
        where: { planId: 'BASIC', billingCycleType: 'MONTHLY' },
      });

      const res = await request(app.getHttpServer())
        .post('/api/billing/checkout-session')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          variantId: basicVariant!.id,
          successUrl: 'http://localhost:5173/success',
          cancelUrl: 'http://localhost:5173/cancel',
        })
        .expect(400);

      // BASIC variant has checkoutEnabled=false
      expect(res.body.message).toBeDefined();
    });

    it('rejects invalid success URL origin', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/billing/checkout-session')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          variantId: proVariantId,
          successUrl: 'https://malicious.com/success',
          cancelUrl: 'http://localhost:5173/cancel',
        })
        .expect(400);

      expect(res.body.message).toContain('origin not allowed');
    });

    it('rejects unauthenticated request', async () => {
      await request(app.getHttpServer())
        .post('/api/billing/checkout-session')
        .send({
          variantId: proVariantId,
          successUrl: 'http://localhost:5173/success',
          cancelUrl: 'http://localhost:5173/cancel',
        })
        .expect(401);
    });

    it('creates checkout session for valid variant', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/billing/checkout-session')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          variantId: proVariantId,
          successUrl: 'http://localhost:5173/success',
          cancelUrl: 'http://localhost:5173/cancel',
        })
        .expect(201);

      expect(res.body.checkoutUrl).toBe(
        'https://checkout.stripe.com/test_session',
      );
      expect(res.body.sessionId).toBeDefined();

      // Verify local session was created
      const localSession = await prisma.billingCheckoutSession.findFirst({
        where: { id: res.body.sessionId },
      });
      expect(localSession).toBeDefined();
      expect(localSession!.status).toBe('PENDING');
      expect(localSession!.variantId).toBe(proVariantId);
    });

    it('rejects user with active paid subscription', async () => {
      const user = await prisma.user.findFirst({
        where: { email: 'free.user@kapter.local' },
        include: { currentSubscription: true },
      });

      if (user?.currentSubscription) {
        await prisma.subscription.update({
          where: { id: user.currentSubscription.id },
          data: { stripeSubscriptionId: 'sub_test_active' },
        });

        const res = await request(app.getHttpServer())
          .post('/api/billing/checkout-session')
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            variantId: proVariantId,
            successUrl: 'http://localhost:5173/success',
            cancelUrl: 'http://localhost:5173/cancel',
          })
          .expect(400);

        expect(res.body.message).toContain('active paid subscription');

        await prisma.subscription.update({
          where: { id: user.currentSubscription.id },
          data: { stripeSubscriptionId: null },
        });
      }
    });
  });

  // ==================== CHECKOUT SESSION STATUS ====================

  describe('GET /api/billing/checkout-sessions/:sessionId', () => {
    it('returns 400 for non-existent session', async () => {
      await request(app.getHttpServer())
        .get('/api/billing/checkout-sessions/non-existent-id')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(400);
    });

    it('returns session status for own session', async () => {
      const user = await prisma.user.findFirst({
        where: { email: 'free.user@kapter.local' },
      });

      const session = await prisma.billingCheckoutSession.create({
        data: {
          userId: user!.id,
          variantId: proVariantId,
          stripeSessionId: 'cs_test_status_' + Date.now(),
          stripeCustomerId: 'cus_test_status',
          status: 'PENDING',
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/billing/checkout-sessions/${session.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.body.sessionId).toBe(session.id);
      expect(res.body.status).toBe('PENDING');
      expect(res.body.variantId).toBe(proVariantId);
      expect(res.body.completedAt).toBeNull();

      await prisma.billingCheckoutSession.delete({
        where: { id: session.id },
      });
    });

    it('rejects access to other user session', async () => {
      const admin = await prisma.user.findFirst({
        where: { email: 'admin@kapter.local' },
      });

      const session = await prisma.billingCheckoutSession.create({
        data: {
          userId: admin!.id,
          variantId: proVariantId,
          stripeSessionId: 'cs_test_other_' + Date.now(),
          stripeCustomerId: 'cus_test_other',
          status: 'PENDING',
        },
      });

      await request(app.getHttpServer())
        .get(`/api/billing/checkout-sessions/${session.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(400);

      await prisma.billingCheckoutSession.delete({
        where: { id: session.id },
      });
    });
  });

  // ==================== PORTAL SESSION ====================

  describe('POST /api/billing/customer-portal-session', () => {
    beforeEach(async () => {
      // Ensure user has no Stripe customer
      const user = await prisma.user.findFirst({
        where: { email: 'free.user@kapter.local' },
      });
      await prisma.user.update({
        where: { id: user!.id },
        data: { stripeCustomerId: null },
      });
    });

    it('rejects user without Stripe customer', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/billing/customer-portal-session')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ returnUrl: 'http://localhost:5173/account' })
        .expect(400);

      expect(res.body.message).toContain('No Stripe customer');
    });

    it('rejects invalid return URL origin', async () => {
      const user = await prisma.user.findFirst({
        where: { email: 'free.user@kapter.local' },
      });
      await prisma.user.update({
        where: { id: user!.id },
        data: { stripeCustomerId: 'cus_test_portal' },
      });

      const res = await request(app.getHttpServer())
        .post('/api/billing/customer-portal-session')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ returnUrl: 'https://malicious.com/account' })
        .expect(400);

      expect(res.body.message).toContain('origin not allowed');

      await prisma.user.update({
        where: { id: user!.id },
        data: { stripeCustomerId: null },
      });
    });

    it('creates portal session for valid user', async () => {
      const user = await prisma.user.findFirst({
        where: { email: 'free.user@kapter.local' },
      });
      await prisma.user.update({
        where: { id: user!.id },
        data: { stripeCustomerId: 'cus_test_portal_valid' },
      });

      const res = await request(app.getHttpServer())
        .post('/api/billing/customer-portal-session')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ returnUrl: 'http://localhost:5173/account' })
        .expect(201);

      expect(res.body.url).toBe('https://billing.stripe.com/test_portal');

      await prisma.user.update({
        where: { id: user!.id },
        data: { stripeCustomerId: null },
      });
    });
  });

  // ==================== WEBHOOK PROCESSING ====================

  describe('POST /api/billing/webhooks/stripe', () => {
    it('rejects request without stripe-signature header', async () => {
      await request(app.getHttpServer())
        .post('/api/billing/webhooks/stripe')
        .send({ type: 'test' })
        .expect(400);
    });

    it('rejects request with invalid signature', async () => {
      await request(app.getHttpServer())
        .post('/api/billing/webhooks/stripe')
        .set('stripe-signature', 'invalid_signature')
        .send({ type: 'test' })
        .expect(400);
    });
  });

  // ==================== ENTITLEMENT SYNC ====================

  describe('Entitlement sync', () => {
    it('FREE fallback marks paid sub cancelled and assigns FREE', async () => {
      const user = await prisma.user.findFirst({
        where: { email: 'free.user@kapter.local' },
        include: { currentSubscription: true },
      });

      const paidSub = await prisma.subscription.create({
        data: {
          userId: user!.id,
          variantId: proVariantId,
          startDate: new Date(),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          status: 'ACTIVE',
          priceSnapshot: 99000,
          monthlyQuotaSecondsSnapshot: 72000,
          maxDurationPerFileSnapshot: 3600,
          aiCreditsPerMonthSnapshot: 100,
          stripeSubscriptionId: 'sub_test_fallback_' + Date.now(),
          stripePriceId: 'price_test_fallback',
          stripeStatus: 'active',
        },
      });

      await prisma.user.update({
        where: { id: user!.id },
        data: { currentSubscriptionId: paidSub.id },
      });

      const { EntitlementSyncService } =
        await import('../src/modules/billing/services/entitlement-sync.service');
      const entitlementSync = app.get(EntitlementSyncService);

      await entitlementSync.handleSubscriptionDeleted({
        id: paidSub.stripeSubscriptionId,
        metadata: { internalUserId: user!.id },
      } as any);

      const updatedPaidSub = await prisma.subscription.findUnique({
        where: { id: paidSub.id },
      });
      expect(updatedPaidSub!.status).toBe('CANCELLED');
      expect(updatedPaidSub!.stripeStatus).toBe('canceled');

      const updatedUser = await prisma.user.findUnique({
        where: { id: user!.id },
        include: { currentSubscription: { include: { variant: true } } },
      });
      expect(updatedUser!.currentSubscriptionId).not.toBe(paidSub.id);
      expect(updatedUser!.currentSubscription!.variant.planId).toBe('FREE');
    });

    it('invoice.paid replenishes AI credits', async () => {
      const user = await prisma.user.findFirst({
        where: { email: 'free.user@kapter.local' },
        include: { currentSubscription: true },
      });

      // Set a stripe subscription ID and zero credits
      const subId = 'sub_test_replenish_' + Date.now();
      await prisma.subscription.update({
        where: { id: user!.currentSubscription!.id },
        data: { stripeSubscriptionId: subId },
      });
      await prisma.user.update({
        where: { id: user!.id },
        data: { aiCreditsRemaining: 0 },
      });

      const { EntitlementSyncService } =
        await import('../src/modules/billing/services/entitlement-sync.service');
      const entitlementSync = app.get(EntitlementSyncService);

      await entitlementSync.handleInvoicePaid({
        subscription: subId,
      } as any);

      const updatedUser = await prisma.user.findUnique({
        where: { id: user!.id },
      });
      expect(updatedUser!.aiCreditsRemaining).toBeGreaterThan(0);

      // Cleanup
      await prisma.subscription.update({
        where: { id: user!.currentSubscription!.id },
        data: { stripeSubscriptionId: null },
      });
    });

    it('payment_failed marks subscription past_due', async () => {
      const user = await prisma.user.findFirst({
        where: { email: 'free.user@kapter.local' },
        include: { currentSubscription: true },
      });

      const subId = 'sub_test_past_due_' + Date.now();
      await prisma.subscription.update({
        where: { id: user!.currentSubscription!.id },
        data: { stripeSubscriptionId: subId, stripeStatus: 'active' },
      });

      const { EntitlementSyncService } =
        await import('../src/modules/billing/services/entitlement-sync.service');
      const entitlementSync = app.get(EntitlementSyncService);

      await entitlementSync.handlePaymentFailed({
        subscription: subId,
      } as any);

      const updatedSub = await prisma.subscription.findUnique({
        where: { id: user!.currentSubscription!.id },
      });
      expect(updatedSub!.stripeStatus).toBe('past_due');

      await prisma.subscription.update({
        where: { id: user!.currentSubscription!.id },
        data: { stripeSubscriptionId: null, stripeStatus: null },
      });
    });
  });

  // ==================== WEBHOOK IDEMPOTENCY ====================

  describe('Webhook idempotency', () => {
    it('skips already-processed events', async () => {
      const { WebhookService } =
        await import('../src/modules/billing/services/webhook.service');
      const webhookService = app.get(WebhookService);

      const eventId = 'evt_test_idempotent_' + Date.now();
      const event = await prisma.billingWebhookEvent.create({
        data: {
          stripeEventId: eventId,
          type: 'test.event',
          rawPayload: { id: eventId, type: 'test.event' },
          status: 'PROCESSED',
          processedAt: new Date(),
        },
      });

      await webhookService.handleEvent({
        id: eventId,
        type: 'test.event',
        data: { object: {} },
      } as any);

      const updatedEvent = await prisma.billingWebhookEvent.findUnique({
        where: { id: event.id },
      });
      expect(updatedEvent!.status).toBe('PROCESSED');

      await prisma.billingWebhookEvent.delete({ where: { id: event.id } });
    });

    it('stores and processes new events', async () => {
      const { WebhookService } =
        await import('../src/modules/billing/services/webhook.service');
      const webhookService = app.get(WebhookService);

      const eventId = 'evt_test_new_' + Date.now();
      await webhookService.handleEvent({
        id: eventId,
        type: 'checkout.session.expired',
        api_version: '2025-01-01',
        data: { object: { id: 'cs_test_expired_' + Date.now() } },
      } as any);

      const storedEvent = await prisma.billingWebhookEvent.findFirst({
        where: { stripeEventId: eventId },
      });
      expect(storedEvent).toBeDefined();
      expect(storedEvent!.status).toBe('PROCESSED');
    });
  });
});
