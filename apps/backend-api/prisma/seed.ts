import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { PrismaClient, BillingCycleType, Role } from './generated/client';
import { PrismaPg } from '@prisma/adapter-pg';

const pool = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter: pool });

const TEST_PASSWORD = 'Test@123';
const BCRYPT_ROUNDS = 12;
const FAR_FUTURE = new Date('9999-12-31T23:59:59.999Z');
const UNLIMITED_SECONDS = 2_147_483_647;

type SeedVariantConfig = {
  id: string;
  planId: string;
  name: string;
  price: number;
  currency: string;
  billingCycleType: BillingCycleType;
  maxDurationPerFile: number;
  monthlyQuotaSeconds: number;
};

type SeedUserConfig = {
  email: string;
  fullName: string;
  variantId: string;
  role: Role;
  maxDurationPerFileSnapshot?: number;
  monthlyQuotaSecondsSnapshot?: number;
};

const SEED_VARIANTS: SeedVariantConfig[] = [
  {
    id: 'FREE_MONTHLY',
    planId: 'FREE',
    name: 'Free Forever',
    price: 0,
    currency: 'VND',
    billingCycleType: BillingCycleType.MONTHLY,
    maxDurationPerFile: 5 * 60,
    monthlyQuotaSeconds: 30 * 60,
  },
  {
    id: 'BASIC_MONTHLY',
    planId: 'BASIC',
    name: 'Monthly',
    price: 49000,
    currency: 'VND',
    billingCycleType: BillingCycleType.MONTHLY,
    maxDurationPerFile: 15 * 60,
    monthlyQuotaSeconds: 5 * 60 * 60,
  },
  {
    id: 'BASIC_YEARLY',
    planId: 'BASIC',
    name: 'Yearly (Save 17%)',
    price: 490000,
    currency: 'VND',
    billingCycleType: BillingCycleType.YEARLY,
    maxDurationPerFile: 15 * 60,
    monthlyQuotaSeconds: 5 * 60 * 60,
  },
  {
    id: 'PRO_MONTHLY',
    planId: 'PRO',
    name: 'Monthly',
    price: 99000,
    currency: 'VND',
    billingCycleType: BillingCycleType.MONTHLY,
    maxDurationPerFile: 60 * 60,
    monthlyQuotaSeconds: 20 * 60 * 60,
  },
  {
    id: 'PRO_YEARLY',
    planId: 'PRO',
    name: 'Yearly (Save 17%)',
    price: 990000,
    currency: 'VND',
    billingCycleType: BillingCycleType.YEARLY,
    maxDurationPerFile: 60 * 60,
    monthlyQuotaSeconds: 20 * 60 * 60,
  },
  {
    id: 'PRO_LIFETIME',
    planId: 'PRO',
    name: 'Lifetime (Best Value)',
    price: 2990000,
    currency: 'VND',
    billingCycleType: BillingCycleType.LIFETIME,
    maxDurationPerFile: 60 * 60,
    monthlyQuotaSeconds: 20 * 60 * 60,
  },
];

const EXAMPLE_USERS: SeedUserConfig[] = [
  {
    email: 'sondndev@gmail.com',
    fullName: 'Son Do Admin',
    variantId: 'PRO_LIFETIME',
    role: Role.ADMIN,
    maxDurationPerFileSnapshot: UNLIMITED_SECONDS,
    monthlyQuotaSecondsSnapshot: UNLIMITED_SECONDS,
  },
  {
    email: 'free.user@example.com',
    fullName: 'Free User',
    variantId: 'FREE_MONTHLY',
    role: Role.USER,
  },
  {
    email: 'basic.monthly@example.com',
    fullName: 'Basic Monthly User',
    variantId: 'BASIC_MONTHLY',
    role: Role.USER,
  },
  {
    email: 'basic.yearly@example.com',
    fullName: 'Basic Yearly User',
    variantId: 'BASIC_YEARLY',
    role: Role.USER,
  },
  {
    email: 'pro.monthly@example.com',
    fullName: 'Pro Monthly User',
    variantId: 'PRO_MONTHLY',
    role: Role.USER,
  },
];

async function upsertPlan(args: {
  id: string;
  code: string;
  name: string;
  description: string;
  tierLevel: number;
  features: string[];
}) {
  return prisma.subscriptionPlan.upsert({
    where: { id: args.id },
    update: {
      code: args.code,
      name: args.name,
      description: args.description,
      tierLevel: args.tierLevel,
      features: args.features,
      isActive: true,
    },
    create: {
      id: args.id,
      code: args.code,
      name: args.name,
      description: args.description,
      tierLevel: args.tierLevel,
      features: args.features,
    },
  });
}

async function upsertVariant(variant: SeedVariantConfig): Promise<void> {
  await prisma.planVariant.upsert({
    where: { id: variant.id },
    update: {
      planId: variant.planId,
      name: variant.name,
      price: variant.price,
      currency: variant.currency,
      billingCycleType: variant.billingCycleType,
      maxDurationPerFile: variant.maxDurationPerFile,
      monthlyQuotaSeconds: variant.monthlyQuotaSeconds,
      isActive: true,
    },
    create: {
      id: variant.id,
      planId: variant.planId,
      name: variant.name,
      price: variant.price,
      currency: variant.currency,
      billingCycleType: variant.billingCycleType,
      maxDurationPerFile: variant.maxDurationPerFile,
      monthlyQuotaSeconds: variant.monthlyQuotaSeconds,
    },
  });
}

async function seedExampleUser(
  userConfig: SeedUserConfig,
  passwordHash: string,
): Promise<void> {
  const variant = await prisma.planVariant.findUniqueOrThrow({
    where: { id: userConfig.variantId },
    select: {
      id: true,
      price: true,
      maxDurationPerFile: true,
      monthlyQuotaSeconds: true,
    },
  });

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email: userConfig.email },
      update: {
        fullName: userConfig.fullName,
        passwordHash,
        emailVerified: true,
        role: userConfig.role,
        quotaUsageCurrentMonth: 0,
        quotaUsageCurrentMonthSeconds: 0,
        lastQuotaResetDate: new Date(),
      },
      create: {
        email: userConfig.email,
        fullName: userConfig.fullName,
        passwordHash,
        emailVerified: true,
        role: userConfig.role,
        quotaUsageCurrentMonth: 0,
        quotaUsageCurrentMonthSeconds: 0,
        lastQuotaResetDate: new Date(),
      },
      select: { id: true },
    });

    await tx.usageHistory.deleteMany({ where: { userId: user.id } });
    await tx.user.update({
      where: { id: user.id },
      data: { currentSubscriptionId: null },
    });
    await tx.subscription.deleteMany({ where: { userId: user.id } });

    const subscription = await tx.subscription.create({
      data: {
        userId: user.id,
        variantId: variant.id,
        startDate: new Date(),
        endDate: FAR_FUTURE,
        status: 'ACTIVE',
        priceSnapshot: variant.price,
        maxDurationPerFileSnapshot:
          userConfig.maxDurationPerFileSnapshot ?? variant.maxDurationPerFile,
        monthlyQuotaSecondsSnapshot:
          userConfig.monthlyQuotaSecondsSnapshot ?? variant.monthlyQuotaSeconds,
      },
      select: { id: true },
    });

    await tx.user.update({
      where: { id: user.id },
      data: { currentSubscriptionId: subscription.id },
    });
  });

  console.log(
    `   - ${userConfig.email} -> ${userConfig.variantId} (${userConfig.role})`,
  );
}

/**
 * Smart Seeding for Subscription Plans
 * Based on SaaS pricing best practices:
 * - Free tier for user acquisition
 * - Basic tier for casual users
 * - Pro tier for power users with best value yearly option
 */
async function main() {
  console.log('🌱 Seeding subscription plans and example users...');

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);

  // ==================== FREE TIER ====================
  await upsertPlan({
    id: 'FREE',
    code: 'free',
    name: 'Free',
    description: 'Get started with basic transcription features',
    tierLevel: 1,
    features: ['Basic transcription', '5 min per file', '30 min/month quota'],
  });

  // ==================== BASIC TIER ====================
  await upsertPlan({
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
  });

  // ==================== PRO TIER ====================
  await upsertPlan({
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
  });

  for (const variant of SEED_VARIANTS) {
    await upsertVariant(variant);
  }

  console.log('👥 Seeding example users...');
  for (const userConfig of EXAMPLE_USERS) {
    await seedExampleUser(userConfig, passwordHash);
  }

  console.log('✅ Seeding completed!');
  console.log('   - FREE: 1 variant');
  console.log('   - BASIC: 2 variants (Monthly, Yearly)');
  console.log('   - PRO: 3 variants (Monthly, Yearly, Lifetime)');
  console.log(`   - USERS: ${EXAMPLE_USERS.length} example accounts`);
  console.log(`   - PASSWORD: ${TEST_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
