import {
  Injectable,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { SubscriptionPlan, Prisma } from 'prisma/generated/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { BaseCrudService } from 'src/common/services';
import { CreatePlanDto, UpdatePlanDto } from '../dto';

@Injectable()
export class PlanService extends BaseCrudService<
  SubscriptionPlan,
  CreatePlanDto,
  UpdatePlanDto
> {
  constructor(prisma: PrismaService) {
    super(prisma, 'subscriptionPlan', 'Plan');
  }

  /**
   * Get all plans with variants and counts.
   */
  async findAllWithVariants() {
    return this.prisma.subscriptionPlan.findMany({
      include: {
        variants: {
          orderBy: { billingCycleType: 'asc' },
        },
        _count: {
          select: { variants: true },
        },
      },
      orderBy: { tierLevel: 'asc' },
    });
  }

  /**
   * Get a plan by ID with full variant details.
   */
  async findByIdWithVariants(id: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id },
      include: {
        variants: {
          include: {
            _count: { select: { subscriptions: true } },
          },
          orderBy: { billingCycleType: 'asc' },
        },
      },
    });

    if (!plan) {
      return this.findById(id); // Will throw NotFoundException
    }

    return plan;
  }

  async create(dto: CreatePlanDto): Promise<SubscriptionPlan> {
    // Check for duplicate ID or code
    const existing = await this.prisma.subscriptionPlan.findFirst({
      where: {
        OR: [{ id: dto.id }, { code: dto.code }],
      },
    });

    if (existing) {
      throw new ConflictException(
        existing.id === dto.id
          ? `Plan with ID "${dto.id}" already exists`
          : `Plan with code "${dto.code}" already exists`,
      );
    }

    return this.prisma.subscriptionPlan.create({
      data: {
        id: dto.id,
        code: dto.code,
        name: dto.name,
        description: dto.description,
        features: dto.features as Prisma.JsonArray,
        tierLevel: dto.tierLevel ?? 1,
      },
    });
  }

  async update(id: string, dto: UpdatePlanDto): Promise<SubscriptionPlan> {
    await this.findById(id); // Ensure exists

    return this.prisma.subscriptionPlan.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        features: dto.features as Prisma.JsonArray | undefined,
        tierLevel: dto.tierLevel,
        isActive: dto.isActive,
      },
    });
  }

  async delete(id: string) {
    await this.findById(id);

    // Check if any variant has active subscriptions
    const activeSubscriptions = await this.prisma.subscription.count({
      where: {
        variant: { planId: id },
        status: 'ACTIVE',
      },
    });

    if (activeSubscriptions > 0) {
      throw new BadRequestException(
        `Cannot delete plan with ${activeSubscriptions} active subscriptions. Soft-disable instead.`,
      );
    }

    // Soft delete: deactivate plan and all variants
    await this.prisma.$transaction([
      this.prisma.planVariant.updateMany({
        where: { planId: id },
        data: { isActive: false },
      }),
      this.prisma.subscriptionPlan.update({
        where: { id },
        data: { isActive: false },
      }),
    ]);

    return { message: 'Plan deactivated successfully' };
  }
}
