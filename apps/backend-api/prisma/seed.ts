import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import {
  BillingCycleType,
  PrismaClient,
  Role,
  SubscriptionStatus,
} from './generated/client';
import { PrismaPg } from '@prisma/adapter-pg';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run prisma/seed.ts');
}

const pool = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: pool });

const TEST_PASSWORD = process.env.SEED_TEST_PASSWORD ?? 'Test@123';
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
  aiCreditsPerMonth: number;
};

type SeedUserConfig = {
  email: string;
  fullName: string;
  variantId: string;
  role: Role;
  maxDurationPerFileSnapshot?: number;
  monthlyQuotaSecondsSnapshot?: number;
  aiCreditsPerMonthSnapshot?: number;
};

const SEED_VARIANTS: SeedVariantConfig[] = [
  {
    id: 'FREE_MONTHLY',
    planId: 'FREE',
    name: 'Free Forever',
    price: 0,
    currency: 'USD',
    billingCycleType: BillingCycleType.MONTHLY,
    maxDurationPerFile: 5 * 60,
    monthlyQuotaSeconds: 30 * 60,
    aiCreditsPerMonth: 10,
  },
  {
    id: 'BASIC_MONTHLY',
    planId: 'BASIC',
    name: 'Monthly',
    price: 4.99,
    currency: 'USD',
    billingCycleType: BillingCycleType.MONTHLY,
    maxDurationPerFile: 15 * 60,
    monthlyQuotaSeconds: 5 * 60 * 60,
    aiCreditsPerMonth: 50,
  },
  {
    id: 'BASIC_YEARLY',
    planId: 'BASIC',
    name: 'Yearly (Save 17%)',
    price: 49.99,
    currency: 'USD',
    billingCycleType: BillingCycleType.YEARLY,
    maxDurationPerFile: 15 * 60,
    monthlyQuotaSeconds: 5 * 60 * 60,
    aiCreditsPerMonth: 60,
  },
  {
    id: 'PRO_MONTHLY',
    planId: 'PRO',
    name: 'Monthly',
    price: 9.99,
    currency: 'USD',
    billingCycleType: BillingCycleType.MONTHLY,
    maxDurationPerFile: 60 * 60,
    monthlyQuotaSeconds: 20 * 60 * 60,
    aiCreditsPerMonth: 100,
  },
  {
    id: 'PRO_YEARLY',
    planId: 'PRO',
    name: 'Yearly (Save 17%)',
    price: 99.99,
    currency: 'USD',
    billingCycleType: BillingCycleType.YEARLY,
    maxDurationPerFile: 60 * 60,
    monthlyQuotaSeconds: 20 * 60 * 60,
    aiCreditsPerMonth: 150,
  },
  {
    id: 'PRO_LIFETIME',
    planId: 'PRO',
    name: 'Lifetime (Best Value)',
    price: 299.99,
    currency: 'USD',
    billingCycleType: BillingCycleType.LIFETIME,
    maxDurationPerFile: 60 * 60,
    monthlyQuotaSeconds: 20 * 60 * 60,
    aiCreditsPerMonth: 150,
  },
];

const EXAMPLE_USERS: SeedUserConfig[] = [
  {
    email: 'sondoannam202@gmail.com',
    fullName: 'Son Doan Nam',
    variantId: 'FREE_MONTHLY',
    role: Role.USER,
  },
  {
    email: 'sondndev@gmail.com',
    fullName: 'Son Doan Dev',
    variantId: 'PRO_LIFETIME',
    role: Role.ADMIN,
  },
  {
    email: process.env.SEED_ADMIN_EMAIL ?? 'admin@kapter.local',
    fullName: 'Kapter Admin',
    variantId: 'PRO_LIFETIME',
    role: Role.ADMIN,
    maxDurationPerFileSnapshot: UNLIMITED_SECONDS,
    monthlyQuotaSecondsSnapshot: UNLIMITED_SECONDS,
    aiCreditsPerMonthSnapshot: UNLIMITED_SECONDS,
  },
  {
    email: process.env.SEED_FREE_USER_EMAIL ?? 'free.user@kapter.local',
    fullName: 'Kapter Free User',
    variantId: 'FREE_MONTHLY',
    role: Role.USER,
  },
  {
    email:
      process.env.SEED_BASIC_MONTHLY_USER_EMAIL ?? 'basic.monthly@kapter.local',
    fullName: 'Kapter Basic Monthly User',
    variantId: 'BASIC_MONTHLY',
    role: Role.USER,
  },
  {
    email:
      process.env.SEED_BASIC_YEARLY_USER_EMAIL ?? 'basic.yearly@kapter.local',
    fullName: 'Kapter Basic Yearly User',
    variantId: 'BASIC_YEARLY',
    role: Role.USER,
  },
  {
    email:
      process.env.SEED_PRO_MONTHLY_USER_EMAIL ?? 'pro.monthly@kapter.local',
    fullName: 'Kapter Pro Monthly User',
    variantId: 'PRO_MONTHLY',
    role: Role.USER,
  },
  {
    email: process.env.SEED_PRO_YEARLY_USER_EMAIL ?? 'pro.yearly@kapter.local',
    fullName: 'Kapter Pro Yearly User',
    variantId: 'PRO_YEARLY',
    role: Role.USER,
  },
  {
    email:
      process.env.SEED_PRO_LIFETIME_USER_EMAIL ?? 'pro.lifetime@kapter.local',
    fullName: 'Kapter Pro Lifetime User',
    variantId: 'PRO_LIFETIME',
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
      aiCreditsPerMonth: variant.aiCreditsPerMonth,
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
      aiCreditsPerMonth: variant.aiCreditsPerMonth,
    },
  });
}

function getSubscriptionWindow(
  billingCycleType: BillingCycleType,
  now = new Date(),
): { startDate: Date; endDate: Date } {
  const startDate = new Date(now);
  const endDate = new Date(now);

  switch (billingCycleType) {
    case BillingCycleType.MONTHLY:
      endDate.setMonth(endDate.getMonth() + 1);
      break;
    case BillingCycleType.SIX_MONTHS:
      endDate.setMonth(endDate.getMonth() + 6);
      break;
    case BillingCycleType.YEARLY:
      endDate.setFullYear(endDate.getFullYear() + 1);
      break;
    case BillingCycleType.LIFETIME:
      return { startDate, endDate: FAR_FUTURE };
  }

  return { startDate, endDate };
}

function getUsageCycleEndDate(
  cycleStartDate: Date,
  billingCycleType: BillingCycleType,
): Date {
  const cycleEndDate = new Date(cycleStartDate);

  switch (billingCycleType) {
    case BillingCycleType.MONTHLY:
      cycleEndDate.setMonth(cycleEndDate.getMonth() + 1);
      break;
    case BillingCycleType.SIX_MONTHS:
      cycleEndDate.setMonth(cycleEndDate.getMonth() + 6);
      break;
    case BillingCycleType.YEARLY:
      cycleEndDate.setFullYear(cycleEndDate.getFullYear() + 1);
      break;
    case BillingCycleType.LIFETIME:
      cycleEndDate.setMonth(cycleEndDate.getMonth() + 1);
      break;
  }

  return cycleEndDate;
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
      billingCycleType: true,
      maxDurationPerFile: true,
      monthlyQuotaSeconds: true,
      aiCreditsPerMonth: true,
    },
  });

  const subscriptionWindow = getSubscriptionWindow(variant.billingCycleType);
  const usageCycleStartDate = new Date(subscriptionWindow.startDate);
  const usageCycleEndDate = getUsageCycleEndDate(
    usageCycleStartDate,
    variant.billingCycleType,
  );

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
        lastQuotaResetDate: usageCycleStartDate,
        aiCreditsRemaining:
          userConfig.aiCreditsPerMonthSnapshot ?? variant.aiCreditsPerMonth,
        aiCreditsLastResetDate: usageCycleStartDate,
      },
      create: {
        email: userConfig.email,
        fullName: userConfig.fullName,
        passwordHash,
        emailVerified: true,
        role: userConfig.role,
        quotaUsageCurrentMonth: 0,
        quotaUsageCurrentMonthSeconds: 0,
        lastQuotaResetDate: usageCycleStartDate,
        aiCreditsRemaining:
          userConfig.aiCreditsPerMonthSnapshot ?? variant.aiCreditsPerMonth,
        aiCreditsLastResetDate: usageCycleStartDate,
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
        startDate: subscriptionWindow.startDate,
        endDate: subscriptionWindow.endDate,
        status: SubscriptionStatus.ACTIVE,
        priceSnapshot: variant.price,
        maxDurationPerFileSnapshot:
          userConfig.maxDurationPerFileSnapshot ?? variant.maxDurationPerFile,
        monthlyQuotaSecondsSnapshot:
          userConfig.monthlyQuotaSecondsSnapshot ?? variant.monthlyQuotaSeconds,
        aiCreditsPerMonthSnapshot:
          userConfig.aiCreditsPerMonthSnapshot ?? variant.aiCreditsPerMonth,
      },
      select: { id: true },
    });

    await tx.usageHistory.create({
      data: {
        userId: user.id,
        subscriptionId: subscription.id,
        cycleStartDate: usageCycleStartDate,
        cycleEndDate: usageCycleEndDate,
        totalSecondsUsed: 0,
        quotaLimitAtThatTime:
          userConfig.monthlyQuotaSecondsSnapshot ?? variant.monthlyQuotaSeconds,
      },
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

async function main() {
  console.log('Seeding Kapter subscription plans and example users...');

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);

  await upsertPlan({
    id: 'FREE',
    code: 'free',
    name: 'Free',
    description: 'Get started with core subtitle learning features.',
    tierLevel: 1,
    features: [
      'Basic transcription',
      '5 min per file',
      '30 min/month processing quota',
      '10 AI explain credits/month',
    ],
  });

  await upsertPlan({
    id: 'BASIC',
    code: 'basic',
    name: 'Basic',
    description: 'For regular learners who need more quota and AI help.',
    tierLevel: 2,
    features: [
      'HD quality transcription',
      '15 min per file',
      '5 hours/month processing quota',
      '50-60 AI explain credits/month',
      'Priority processing',
    ],
  });

  await upsertPlan({
    id: 'PRO',
    code: 'pro',
    name: 'Pro',
    description: 'For power users and professionals.',
    tierLevel: 3,
    features: [
      'Best quality transcription',
      '60 min per file',
      '20 hours/month processing quota',
      '100-150 AI explain credits/month',
      'Vocabulary building',
      'No ads',
      'Fast processing',
      'Priority support',
    ],
  });

  for (const variant of SEED_VARIANTS) {
    await upsertVariant(variant);
  }

  console.log('Seeding example users...');
  for (const userConfig of EXAMPLE_USERS) {
    await seedExampleUser(userConfig, passwordHash);
  }

  console.log('Seeding completed.');
  console.log('   - FREE: 1 variant');
  console.log('   - BASIC: 2 variants (Monthly, Yearly)');
  console.log('   - PRO: 3 variants (Monthly, Yearly, Lifetime)');
  console.log(`   - USERS: ${EXAMPLE_USERS.length} example accounts`);
  console.log(`   - PASSWORD: ${TEST_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
