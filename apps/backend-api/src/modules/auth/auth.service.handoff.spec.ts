import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService - Mobile Web Handoff', () => {
  function createMocks() {
    const prisma = {
      user: { findUnique: jest.fn() },
    };
    const redis = {
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
    };
    const configService = {
      getOrThrow: jest.fn().mockReturnValue('http://localhost:5173'),
    };
    return { prisma, redis, configService };
  }

  describe('createMobileWebHandoff', () => {
    it('creates a token in Redis and returns handoffUrl', async () => {
      const { prisma, redis, configService } = createMocks();
      const service = new AuthService(
        prisma as never,
        redis as never,
        {} as never,
        {} as never,
        {} as never,
        configService as never,
      );

      const result = await service.createMobileWebHandoff('user-1', 'pricing');

      expect(result.expiresInSeconds).toBe(120);
      expect(result.handoffUrl).toContain('http://localhost:5173/handoff?token=');
      expect(result.handoffUrl).toContain('target=pricing');
      expect(result.handoffUrl).toContain('fromMobile=1');
      expect(redis.set).toHaveBeenCalledWith(
        expect.stringMatching(/^mobile-handoff:/),
        expect.stringContaining('"userId":"user-1"'),
        120,
      );
    });

    it('supports account-subscription target', async () => {
      const { prisma, redis, configService } = createMocks();
      const service = new AuthService(
        prisma as never,
        redis as never,
        {} as never,
        {} as never,
        {} as never,
        configService as never,
      );

      const result = await service.createMobileWebHandoff(
        'user-2',
        'account-subscription',
      );

      expect(result.handoffUrl).toContain('target=account-subscription');
    });
  });

  describe('consumeMobileWebHandoff', () => {
    it('consumes token and returns AuthResponse', async () => {
      const { prisma, redis, configService } = createMocks();
      redis.get.mockResolvedValue(
        JSON.stringify({ userId: 'user-1', target: 'pricing' }),
      );
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        fullName: 'Test User',
        emailVerified: true,
        role: 'USER',
      });

      const service = new AuthService(
        prisma as never,
        redis as never,
        {} as never,
        {} as never,
        {} as never,
        configService as never,
      );

      // Mock generateTokens
      (service as any).generateTokens = jest.fn().mockResolvedValue({
        accessToken: 'at',
        refreshToken: 'rt',
      });

      const result = await service.consumeMobileWebHandoff('some-token');

      expect(result.user.id).toBe('user-1');
      expect(result.tokens.accessToken).toBe('at');
      expect(redis.del).toHaveBeenCalledWith('mobile-handoff:some-token');
    });

    it('rejects expired or invalid token', async () => {
      const { prisma, redis, configService } = createMocks();
      redis.get.mockResolvedValue(null);

      const service = new AuthService(
        prisma as never,
        redis as never,
        {} as never,
        {} as never,
        {} as never,
        configService as never,
      );

      await expect(
        service.consumeMobileWebHandoff('expired-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('deletes token after consumption (consume-once)', async () => {
      const { prisma, redis, configService } = createMocks();
      redis.get.mockResolvedValue(
        JSON.stringify({ userId: 'user-1', target: 'pricing' }),
      );
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        fullName: 'Test',
        emailVerified: true,
        role: 'USER',
      });

      const service = new AuthService(
        prisma as never,
        redis as never,
        {} as never,
        {} as never,
        {} as never,
        configService as never,
      );
      (service as any).generateTokens = jest
        .fn()
        .mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' });

      await service.consumeMobileWebHandoff('token-1');

      // Token should be deleted
      expect(redis.del).toHaveBeenCalledWith('mobile-handoff:token-1');

      // Second consume should fail (token already deleted)
      redis.get.mockResolvedValue(null);
      await expect(
        service.consumeMobileWebHandoff('token-1'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
