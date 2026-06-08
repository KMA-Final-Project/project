import { UserAdminService } from './user-admin.service';

describe('UserAdminService', () => {
  describe('findAll with filters', () => {
    it('applies search filter', async () => {
      const prisma = {
        user: {
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
        },
      };
      const service = new UserAdminService(prisma as never);

      await service.findAll({ search: 'test', page: 1, limit: 20 });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const where = prisma.user.findMany.mock.calls[0][0].where;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(where.OR).toBeDefined();
    });

    it('applies role filter', async () => {
      const prisma = {
        user: {
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
        },
      };
      const service = new UserAdminService(prisma as never);

      await service.findAll({ role: 'ADMIN', page: 1, limit: 20 });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const where = prisma.user.findMany.mock.calls[0][0].where;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(where.role).toBe('ADMIN');
    });

    it('applies planId filter', async () => {
      const prisma = {
        user: {
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
        },
      };
      const service = new UserAdminService(prisma as never);

      await service.findAll({ planId: 'PRO', page: 1, limit: 20 });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const where = prisma.user.findMany.mock.calls[0][0].where;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(where.currentSubscription.variant.planId).toBe('PRO');
    });

    it('applies variantId filter', async () => {
      const prisma = {
        user: {
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
        },
      };
      const service = new UserAdminService(prisma as never);

      await service.findAll({ variantId: 'v1', page: 1, limit: 20 });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const where = prisma.user.findMany.mock.calls[0][0].where;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(where.currentSubscription.variantId).toBe('v1');
    });
  });

  describe('updateRole', () => {
    it('blocks self-demotion', async () => {
      const prisma = {
        user: {
          findUnique: jest.fn(),
          count: jest.fn(),
          update: jest.fn(),
        },
      };
      const service = new UserAdminService(prisma as never);

      await expect(
        service.updateRole('user-1', 'user-1', 'USER'),
      ).rejects.toThrow('Cannot change your own role');
    });

    it('blocks demoting last admin', async () => {
      const prisma = {
        user: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: 'admin-1', role: 'ADMIN' }),
          count: jest.fn().mockResolvedValue(1),
          update: jest.fn(),
        },
      };
      const service = new UserAdminService(prisma as never);

      await expect(
        service.updateRole('admin-1', 'other-user', 'USER'),
      ).rejects.toThrow('Cannot demote the last remaining admin');
    });

    it('allows normal role change', async () => {
      const prisma = {
        user: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: 'user-1', role: 'USER' }),
          count: jest.fn().mockResolvedValue(3),
          update: jest.fn().mockResolvedValue({
            id: 'user-1',
            role: 'ADMIN',
            updatedAt: new Date(),
          }),
        },
      };
      const service = new UserAdminService(prisma as never);

      const result = await service.updateRole('user-1', 'admin-1', 'ADMIN');

      expect(result.id).toBe('user-1');
      expect(result.role).toBe('ADMIN');
    });
  });
});
