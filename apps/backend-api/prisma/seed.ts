import 'dotenv/config';
import { PrismaClient, BillingCycleType } from './generated/client';
import { PrismaPg } from '@prisma/adapter-pg';

const pool = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter: pool });

/**
 * Smart Seeding for Subscription Plans
 * Based on SaaS pricing best practices:
 * - Free tier for user acquisition
 * - Basic tier for casual users
 * - Pro tier for power users with best value yearly option
 */
async function main() {
  console.log('🌱 Seeding subscription plans...');

  // ==================== FREE TIER ====================
  const freePlan = await prisma.subscriptionPlan.upsert({
    where: { id: 'FREE' },
    update: {},
    create: {
      id: 'FREE',
      code: 'free',
      name: 'Free',
      description: 'Get started with basic transcription features',
      tierLevel: 1,
      features: ['Basic transcription', '5 min per file', '30 min/month quota'],
    },
  });

  await prisma.planVariant.upsert({
    where: { id: 'FREE_MONTHLY' },
    update: {},
    create: {
      id: 'FREE_MONTHLY',
      planId: freePlan.id,
      name: 'Free Forever',
      price: 0,
      currency: 'VND',
      billingCycleType: BillingCycleType.MONTHLY,
      maxDurationPerFile: 5 * 60, // 5 minutes
      monthlyQuotaSeconds: 30 * 60, // 30 minutes
    },
  });

  // ==================== BASIC TIER ====================
  const basicPlan = await prisma.subscriptionPlan.upsert({
    where: { id: 'BASIC' },
    update: {},
    create: {
      id: 'BASIC',
      code: 'basic',
      name: 'Basic',
      description: 'For casual learners who need more quota',
      tierLevel: 2,
      features: [
        'HD quality transcription',
        '15 min per file',
        '5 hours/month quota',
        'Priority processing',
      ],
    },
  });

  await prisma.planVariant.upsert({
    where: { id: 'BASIC_MONTHLY' },
    update: {},
    create: {
      id: 'BASIC_MONTHLY',
      planId: basicPlan.id,
      name: 'Monthly',
      price: 49000,
      currency: 'VND',
      billingCycleType: BillingCycleType.MONTHLY,
      maxDurationPerFile: 15 * 60, // 15 minutes
      monthlyQuotaSeconds: 5 * 60 * 60, // 5 hours
    },
  });

  await prisma.planVariant.upsert({
    where: { id: 'BASIC_YEARLY' },
    update: {},
    create: {
      id: 'BASIC_YEARLY',
      planId: basicPlan.id,
      name: 'Yearly (Save 17%)',
      price: 490000, // ~2 months free
      currency: 'VND',
      billingCycleType: BillingCycleType.YEARLY,
      maxDurationPerFile: 15 * 60,
      monthlyQuotaSeconds: 5 * 60 * 60,
    },
  });

  // ==================== PRO TIER ====================
  const proPlan = await prisma.subscriptionPlan.upsert({
    where: { id: 'PRO' },
    update: {},
    create: {
      id: 'PRO',
      code: 'pro',
      name: 'Pro',
      description: 'For power users and professionals',
      tierLevel: 3,
      features: [
        'Best quality transcription',
        '60 min per file',
        '20 hours/month quota',
        'Vocabulary building',
        'No ads',
        'Fast processing',
        'Priority support',
      ],
    },
  });

  await prisma.planVariant.upsert({
    where: { id: 'PRO_MONTHLY' },
    update: {},
    create: {
      id: 'PRO_MONTHLY',
      planId: proPlan.id,
      name: 'Monthly',
      price: 99000,
      currency: 'VND',
      billingCycleType: BillingCycleType.MONTHLY,
      maxDurationPerFile: 60 * 60, // 60 minutes
      monthlyQuotaSeconds: 20 * 60 * 60, // 20 hours
    },
  });

  await prisma.planVariant.upsert({
    where: { id: 'PRO_YEARLY' },
    update: {},
    create: {
      id: 'PRO_YEARLY',
      planId: proPlan.id,
      name: 'Yearly (Save 17%)',
      price: 990000, // ~2 months free
      currency: 'VND',
      billingCycleType: BillingCycleType.YEARLY,
      maxDurationPerFile: 60 * 60,
      monthlyQuotaSeconds: 20 * 60 * 60,
    },
  });

  await prisma.planVariant.upsert({
    where: { id: 'PRO_LIFETIME' },
    update: {},
    create: {
      id: 'PRO_LIFETIME',
      planId: proPlan.id,
      name: 'Lifetime (Best Value)',
      price: 2990000, // ~2.5 years
      currency: 'VND',
      billingCycleType: BillingCycleType.LIFETIME,
      maxDurationPerFile: 60 * 60,
      monthlyQuotaSeconds: 20 * 60 * 60,
    },
  });

  console.log('✅ Seeding completed!');
  console.log('   - FREE: 1 variant');
  console.log('   - BASIC: 2 variants (Monthly, Yearly)');
  console.log('   - PRO: 3 variants (Monthly, Yearly, Lifetime)');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
