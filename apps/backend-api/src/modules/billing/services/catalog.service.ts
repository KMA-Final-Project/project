import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { BillingCycleType } from 'prisma/generated/client';
import type { BillingCatalogItem } from '@kapter/contracts';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async getCatalog(): Promise<BillingCatalogItem[]> {
    const variants = await this.prisma.planVariant.findMany({
      where: {
        isActive: true,
        checkoutEnabled: true,
        stripePriceId: { not: null },
        billingCycleType: { not: BillingCycleType.LIFETIME },
        plan: { isActive: true, code: { not: 'free' } },
      },
      include: { plan: true },
      orderBy: { plan: { tierLevel: 'asc' } },
    });

    return variants.map((v) => ({
      planCode: v.plan.code,
      planName: v.plan.name,
      variantId: v.id,
      variantName: v.name,
      price: v.price.toString(),
      currency: v.currency,
      billingCycleType: v.billingCycleType,
      monthlyQuotaSeconds: v.monthlyQuotaSeconds,
      maxDurationPerFile: v.maxDurationPerFile,
      aiCreditsPerMonth: v.aiCreditsPerMonth,
    }));
  }
}
