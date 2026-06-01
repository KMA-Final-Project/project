import { Injectable, NotFoundException } from '@nestjs/common';
import { PlanVariant } from 'prisma/generated/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { BaseCrudService } from 'src/common/services';
import { CreateVariantDto, UpdateVariantDto } from '../dto';
import { PlanService } from './plan.service';

@Injectable()
export class VariantService extends BaseCrudService<
  PlanVariant,
  CreateVariantDto,
  UpdateVariantDto
> {
  constructor(
    prisma: PrismaService,
    private readonly planService: PlanService,
  ) {
    super(prisma, 'planVariant', 'Variant');
  }

  /**
   * Get variant with subscription count.
   */
  async findByIdWithSubscriberCount(id: string) {
    const variant = await this.prisma.planVariant.findUnique({
      where: { id },
      include: {
        _count: { select: { subscriptions: true } },
      },
    });

    if (!variant) {
      throw new NotFoundException(`Variant with ID "${id}" not found`);
    }

    return variant;
  }

  async create(dto: CreateVariantDto, planId?: string): Promise<PlanVariant> {
    if (!planId) {
      throw new Error('planId is required for creating a variant');
    }

    // Verify plan exists
    await this.planService.findById(planId);

    return this.prisma.planVariant.create({
      data: {
        planId,
        name: dto.name,
        price: dto.price,
        currency: dto.currency ?? 'VND',
        billingCycleType: dto.billingCycleType,
        maxDurationPerFile: dto.maxDurationPerFile,
        monthlyQuotaSeconds: dto.monthlyQuotaSeconds,
        aiCreditsPerMonth: dto.aiCreditsPerMonth,
      },
    });
  }

  /**
   * Create variant for a specific plan.
   */
  async createForPlan(
    planId: string,
    dto: CreateVariantDto,
  ): Promise<PlanVariant> {
    return this.create(dto, planId);
  }

  async update(id: string, dto: UpdateVariantDto): Promise<PlanVariant> {
    const variant = await this.findByIdWithSubscriberCount(id);

    const hasSubscribers = variant._count.subscriptions > 0;

    // Check if changing terms (price or limits)
    const isChangingTerms =
      (dto.price !== undefined && dto.price !== Number(variant.price)) ||
      (dto.maxDurationPerFile !== undefined &&
        dto.maxDurationPerFile !== variant.maxDurationPerFile) ||
      (dto.monthlyQuotaSeconds !== undefined &&
        dto.monthlyQuotaSeconds !== variant.monthlyQuotaSeconds) ||
      (dto.aiCreditsPerMonth !== undefined &&
        dto.aiCreditsPerMonth !== variant.aiCreditsPerMonth);

    // If has subscribers AND changing terms → create new version
    if (hasSubscribers && isChangingTerms) {
      const result = await this.createNewVersion(variant, dto);
      return result.newVariant;
    }

    // Direct update (no subscribers or metadata-only change)
    return this.prisma.planVariant.update({
      where: { id },
      data: {
        name: dto.name,
        price: dto.price,
        currency: dto.currency,
        maxDurationPerFile: dto.maxDurationPerFile,
        monthlyQuotaSeconds: dto.monthlyQuotaSeconds,
        aiCreditsPerMonth: dto.aiCreditsPerMonth,
        isActive: dto.isActive,
      },
    });
  }

  /**
   * Create a new variant version, disabling the old one.
   * This protects existing subscribers.
   */
  private async createNewVersion(
    oldVariant: PlanVariant,
    dto: UpdateVariantDto,
  ): Promise<VariantVersionResult> {
    return this.prisma.$transaction(async (tx) => {
      // Deactivate old variant
      await tx.planVariant.update({
        where: { id: oldVariant.id },
        data: { isActive: false },
      });

      // Create new variant with updated values
      const newVariant = await tx.planVariant.create({
        data: {
          planId: oldVariant.planId,
          name: dto.name ?? oldVariant.name,
          price: dto.price ?? oldVariant.price,
          currency: dto.currency ?? oldVariant.currency,
          billingCycleType: oldVariant.billingCycleType,
          maxDurationPerFile:
            dto.maxDurationPerFile ?? oldVariant.maxDurationPerFile,
          monthlyQuotaSeconds:
            dto.monthlyQuotaSeconds ?? oldVariant.monthlyQuotaSeconds,
          aiCreditsPerMonth:
            dto.aiCreditsPerMonth ?? oldVariant.aiCreditsPerMonth,
        },
      });

      return {
        message: 'Created new variant version (old variant disabled)',
        oldVariantId: oldVariant.id,
        newVariant,
      };
    });
  }

  async delete(id: string) {
    const variant = await this.findByIdWithSubscriberCount(id);

    if (variant._count.subscriptions > 0) {
      // Soft delete for variants with history
      await this.prisma.planVariant.update({
        where: { id },
        data: { isActive: false },
      });
      return { message: 'Variant deactivated (has subscription history)' };
    }

    // Hard delete for unused variants
    await this.prisma.planVariant.delete({ where: { id } });
    return { message: 'Variant deleted' };
  }
}

export interface VariantVersionResult {
  message: string;
  oldVariantId: string;
  newVariant: PlanVariant;
}
