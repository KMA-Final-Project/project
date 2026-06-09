import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Role } from 'prisma/generated/client';
import { PrismaService } from 'src/prisma/prisma.service';
import type {
  AdminUsersQueryDto,
  AdminUserListItemDto,
  AdminUserListResponseDto,
  AdminUserDetailDto,
  AdminUserRoleUpdateResultDto,
} from '../dto/user.dto';

@Injectable()
export class UserAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: AdminUsersQueryDto): Promise<AdminUserListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.role) {
      where.role = query.role;
    }

    if (query.planId) {
      where.currentSubscription = {
        variant: { planId: query.planId },
      };
    }

    if (query.variantId) {
      where.currentSubscription = {
        variantId: query.variantId,
      };
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          currentSubscription: {
            include: {
              variant: {
                include: { plan: true },
              },
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const data: AdminUserListItemDto[] = users.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      role: u.role,
      emailVerified: u.emailVerified,
      createdAt: u.createdAt,
      currentPlanName: u.currentSubscription?.variant?.plan?.name ?? null,
      currentPlanCode: u.currentSubscription?.variant?.plan?.code ?? null,
      subscriptionStatus: u.currentSubscription?.status ?? null,
      quotaUsageCurrentMonthSeconds: u.quotaUsageCurrentMonthSeconds,
    }));

    return { data, total, page, limit };
  }

  async findById(id: string): Promise<AdminUserDetailDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        currentSubscription: {
          include: {
            variant: { include: { plan: true } },
          },
        },
        usageHistories: {
          orderBy: { cycleStartDate: 'desc' },
          take: 3,
        },
        _count: {
          select: { mediaItems: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    const sub = user.currentSubscription;

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      quotaUsageCurrentMonthSeconds: user.quotaUsageCurrentMonthSeconds,
      currentSubscription: sub
        ? {
            id: sub.id,
            status: sub.status,
            startDate: sub.startDate,
            endDate: sub.endDate,
            priceSnapshot: sub.priceSnapshot.toString(),
            monthlyQuotaSecondsSnapshot: sub.monthlyQuotaSecondsSnapshot,
            maxDurationPerFileSnapshot: sub.maxDurationPerFileSnapshot,
            variantName: sub.variant?.name ?? null,
            planName: sub.variant?.plan?.name ?? null,
            planCode: sub.variant?.plan?.code ?? null,
            billingCycleType: sub.variant?.billingCycleType ?? null,
          }
        : null,
      recentUsageHistory: user.usageHistories.map((h) => ({
        id: h.id,
        cycleStartDate: h.cycleStartDate,
        cycleEndDate: h.cycleEndDate,
        totalSecondsUsed: h.totalSecondsUsed,
        quotaLimitAtThatTime: h.quotaLimitAtThatTime,
      })),
      totalMediaItems: user._count.mediaItems,
    };
  }

  async updateRole(
    targetId: string,
    requestUserId: string,
    newRole: Role,
  ): Promise<AdminUserRoleUpdateResultDto> {
    if (targetId === requestUserId) {
      throw new BadRequestException('Cannot change your own role.');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, role: true },
    });

    if (!target) {
      throw new NotFoundException(`User with ID "${targetId}" not found`);
    }

    if (target.role === Role.ADMIN && newRole === Role.USER) {
      const adminCount = await this.prisma.user.count({
        where: { role: Role.ADMIN },
      });
      if (adminCount <= 1) {
        throw new BadRequestException(
          'Cannot demote the last remaining admin.',
        );
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: targetId },
      data: { role: newRole },
      select: { id: true, role: true, updatedAt: true },
    });

    return {
      id: updated.id,
      role: updated.role,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }
}
