import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from 'prisma/generated/client';
import { BillingCycleType } from 'prisma/generated/enums';

const TEST_EMAIL = 'sondoannam202@gmail.com';
const TEST_PASSWORD = 'Test@123';
const TEST_FULL_NAME = 'Bilingual Test User';

export function benchmarkCredentials(): {
  email: string;
  password: string;
} {
  return {
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  };
}

export async function ensureBenchmarkUser(databaseUrl: string): Promise<void> {
  const pool = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: pool });

  try {
    const existing = await prisma.user.findUnique({
      where: { email: TEST_EMAIL },
      select: { id: true, currentSubscriptionId: true },
    });

    const passwordHash = bcrypt.hashSync(TEST_PASSWORD, 12);
    const proVariant = await prisma.planVariant.findFirst({
      where: {
        plan: { code: 'pro' },
        billingCycleType: BillingCycleType.MONTHLY,
        isActive: true,
      },
      select: {
        id: true,
        price: true,
        maxDurationPerFile: true,
        monthlyQuotaSeconds: true,
        aiCreditsPerMonth: true,
      },
    });

    if (!proVariant) {
      throw new Error(
        'Active PRO monthly variant not found. Seed the database first.',
      );
    }

    const farFuture = new Date('9999-12-31T23:59:59.999Z');

    if (!existing) {
      await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: TEST_EMAIL,
            fullName: TEST_FULL_NAME,
            passwordHash,
            emailVerified: true,
            quotaUsageCurrentMonth: 0,
            quotaUsageCurrentMonthSeconds: 0,
            aiCreditsRemaining: proVariant.aiCreditsPerMonth,
          },
          select: { id: true },
        });

        const subscription = await tx.subscription.create({
          data: {
            userId: user.id,
            variantId: proVariant.id,
            startDate: new Date(),
            endDate: farFuture,
            status: 'ACTIVE',
            priceSnapshot: proVariant.price,
            maxDurationPerFileSnapshot: proVariant.maxDurationPerFile,
            monthlyQuotaSecondsSnapshot: proVariant.monthlyQuotaSeconds,
            aiCreditsPerMonthSnapshot: proVariant.aiCreditsPerMonth,
          },
          select: { id: true },
        });

        await tx.user.update({
          where: { id: user.id },
          data: { currentSubscriptionId: subscription.id },
        });
      });
      return;
    }

    await prisma.user.update({
      where: { id: existing.id },
      data: {
        fullName: TEST_FULL_NAME,
        passwordHash,
        emailVerified: true,
        quotaUsageCurrentMonth: 0,
        quotaUsageCurrentMonthSeconds: 0,
        lastQuotaResetDate: new Date(),
        aiCreditsRemaining: proVariant.aiCreditsPerMonth,
        aiCreditsLastResetDate: new Date(),
      },
    });

    if (existing.currentSubscriptionId) {
      await prisma.subscription.update({
        where: { id: existing.currentSubscriptionId },
        data: {
          variantId: proVariant.id,
          status: 'ACTIVE',
          endDate: farFuture,
          priceSnapshot: proVariant.price,
          maxDurationPerFileSnapshot: proVariant.maxDurationPerFile,
          monthlyQuotaSecondsSnapshot: proVariant.monthlyQuotaSeconds,
          aiCreditsPerMonthSnapshot: proVariant.aiCreditsPerMonth,
        },
      });
      return;
    }

    await prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.create({
        data: {
          userId: existing.id,
          variantId: proVariant.id,
          startDate: new Date(),
          endDate: farFuture,
          status: 'ACTIVE',
          priceSnapshot: proVariant.price,
          maxDurationPerFileSnapshot: proVariant.maxDurationPerFile,
          monthlyQuotaSecondsSnapshot: proVariant.monthlyQuotaSeconds,
          aiCreditsPerMonthSnapshot: proVariant.aiCreditsPerMonth,
        },
        select: { id: true },
      });

      await tx.user.update({
        where: { id: existing.id },
        data: { currentSubscriptionId: subscription.id },
      });
    });
  } finally {
    await prisma.$disconnect();
  }
}
