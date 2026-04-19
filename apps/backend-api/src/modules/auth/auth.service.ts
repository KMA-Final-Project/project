import { randomUUID, createHash } from 'crypto';
import {
  Injectable,
  ConflictException,
  BadRequestException,
  UnauthorizedException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from 'src/prisma/prisma.service';
import { RedisService } from 'src/modules/redis/redis.service';
import { MailService } from 'src/modules/mail/mail.service';
import { OtpService } from 'src/modules/otp/otp.service';
import { UserSubscriptionService } from 'src/modules/user/services';
import {
  RegisterDto,
  VerifyRegistrationDto,
  LoginDto,
  AuthResponseDto,
  UserProfileDto,
  TokensDto,
} from './dto';
import { ResendRegistrationOtpDto } from './dto/resend-registration-otp.dto';
import { AUTH_ERRORS } from 'src/common/constants/error-messages';
import { OtpType } from 'prisma/generated/client';
import { Role } from 'prisma/generated/client';
import { ConfigService } from '@nestjs/config';

interface CachedRegistration {
  email: string;
  passwordHash: string;
  fullName: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly mail: MailService,
    private readonly otpService: OtpService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly userSubscriptionService: UserSubscriptionService,
  ) {}

  /**
   * Step 1: Cache registration data in Redis + send OTP
   */
  async register(dto: RegisterDto): Promise<{ message: string }> {
    // Normalize email
    const email = dto.email.toLowerCase().trim();
    const cacheKey = this.getRegistrationCacheKey(email);

    // Check if email already exists in database
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException(AUTH_ERRORS.USER_EMAIL_EXISTS);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Existing pending registration means this is a retry/update flow.
    const hadPendingRegistration = await this.redis.exists(cacheKey);

    // Generate OTP via OtpService (for audit trail)
    const otp = await this.otpService.createOtp(email, OtpType.REGISTER);

    // Cache registration data in Redis
    const cacheData: CachedRegistration = {
      email,
      passwordHash,
      fullName: dto.fullName.trim(),
    };
    await this.redis.setJson(
      cacheKey,
      cacheData,
      this.configService.getOrThrow<number>('REGISTRATION_TTL_SECONDS'),
    );

    // Send OTP email
    await this.mail.sendOtp(email, otp, OtpType.REGISTER);

    return {
      message: hadPendingRegistration
        ? 'Registration updated. Verification code resent to your email. Please verify within 10 minutes.'
        : 'Verification code sent to your email. Please verify within 10 minutes.',
    };
  }

  /**
   * Resend registration OTP using cached registration payload.
   * This refreshes Redis TTL so users can continue registration after reconnect/reopen.
   */
  async resendRegistrationOtp(
    dto: ResendRegistrationOtpDto,
    ip?: string,
  ): Promise<{ message: string }> {
    const email = dto.email.toLowerCase().trim();

    // Do not allow resend for already-registered accounts.
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      throw new ConflictException(AUTH_ERRORS.USER_EMAIL_EXISTS);
    }

    const cacheKey = this.getRegistrationCacheKey(email);
    const cached = await this.redis.getJson<CachedRegistration>(cacheKey);
    if (!cached) {
      throw new BadRequestException(AUTH_ERRORS.REGISTRATION_EXPIRED);
    }

    await this.enforceResendRateLimits(email, ip);

    // Generate new OTP and send email.
    const otp = await this.otpService.createOtp(email, OtpType.REGISTER);
    await this.mail.sendOtp(email, otp, OtpType.REGISTER);

    // Refresh registration TTL to keep pending registration alive.
    await this.redis.setJson(
      cacheKey,
      cached,
      this.configService.getOrThrow<number>('REGISTRATION_TTL_SECONDS'),
    );

    return {
      message:
        'Verification code resent to your email. Please verify within 10 minutes.',
    };
  }

  /**
   * Step 2: Verify OTP and commit user to database
   */
  async verifyRegistration(
    dto: VerifyRegistrationDto,
    ip?: string,
    deviceInfo?: string,
  ): Promise<AuthResponseDto> {
    // Normalize email
    const email = dto.email.toLowerCase().trim();

    // Verify OTP via OtpService
    const isValid = await this.otpService.verifyOtp(
      email,
      dto.otp,
      OtpType.REGISTER,
    );

    if (!isValid) {
      throw new BadRequestException(AUTH_ERRORS.OTP_INVALID);
    }

    // Get cached registration data
    const cacheKey = this.getRegistrationCacheKey(email);
    const cached = await this.redis.getJson<CachedRegistration>(cacheKey);

    if (!cached) {
      throw new BadRequestException(AUTH_ERRORS.REGISTRATION_EXPIRED);
    }

    // Create user in database
    const user = await this.prisma.user.create({
      data: {
        email: cached.email,
        fullName: cached.fullName,
        passwordHash: cached.passwordHash,
        emailVerified: true,
      },
    });

    // Assign default FREE subscription (snapshot pattern)
    await this.userSubscriptionService.assignDefaultFreePlan(user.id);

    // Cleanup Redis cache
    await this.redis.del(cacheKey);

    // Auto-login: generate tokens
    const tokens = await this.generateTokens(
      user.id,
      user.email,
      ip,
      deviceInfo,
    );

    return {
      user: this.toUserProfile(user),
      tokens,
    };
  }

  /**
   * Login with email and password
   */
  async login(
    dto: LoginDto,
    ip?: string,
    deviceInfo?: string,
  ): Promise<AuthResponseDto> {
    // Normalize email
    const email = dto.email.toLowerCase().trim();

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      const hasPendingRegistration = await this.redis.exists(
        this.getRegistrationCacheKey(email),
      );
      if (hasPendingRegistration) {
        await this.resendRegistrationOtp({ email }, ip);
        throw new BadRequestException(
          AUTH_ERRORS.REGISTRATION_PENDING_VERIFICATION,
        );
      }
      throw new UnauthorizedException(AUTH_ERRORS.WRONG_CREDENTIALS);
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException(AUTH_ERRORS.WRONG_CREDENTIALS);
    }

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      ip,
      deviceInfo,
    );

    return {
      user: this.toUserProfile(user),
      tokens,
    };
  }

  /**
   * Refresh tokens (rotate strategy)
   */
  async refreshTokens(
    refreshToken: string,
    ip?: string,
    deviceInfo?: string,
  ): Promise<TokensDto> {
    // Decode JWT to get the token ID (jti)
    let tokenId: string;
    try {
      const decoded = this.jwtService.verify<{ jti: string; type: string }>(
        refreshToken,
        {
          secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        },
      );
      if (decoded.type !== 'refresh') {
        throw new UnauthorizedException(AUTH_ERRORS.REFRESH_TOKEN_INVALID);
      }
      tokenId = decoded.jti;
    } catch {
      throw new UnauthorizedException(AUTH_ERRORS.REFRESH_TOKEN_INVALID);
    }

    // Find the refresh token in database by ID
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token: tokenId },
      include: { user: true },
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException(AUTH_ERRORS.REFRESH_TOKEN_INVALID);
    }

    // Delete old token (rotation)
    await this.prisma.refreshToken.delete({
      where: { id: storedToken.id },
    });

    // Generate new tokens
    const tokens = await this.generateTokens(
      storedToken.userId,
      storedToken.user.email,
      ip,
      deviceInfo,
    );

    return tokens;
  }

  /**
   * Verify an access token directly for WebSockets
   */
  async verifyAccessToken(
    token: string,
  ): Promise<{ sub: string; email: string }> {
    try {
      return await this.jwtService.verifyAsync(token, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException(AUTH_ERRORS.UNAUTHORIZED);
    }
  }

  /**
   * Logout: invalidate the refresh token
   */
  async logout(refreshToken: string): Promise<{ message: string }> {
    try {
      const decoded = this.jwtService.verify<{ jti: string }>(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
      await this.prisma.refreshToken.deleteMany({
        where: { token: decoded.jti },
      });
    } catch (error) {
      // Token may be expired or malformed - log for monitoring but don't block logout
      console.warn(
        '[Auth] Failed to decode refresh token during logout:',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }

    return { message: 'Logged out successfully' };
  }

  // --- Private Helper Methods ---

  private async generateTokens(
    userId: string,
    email: string,
    ip?: string,
    deviceInfo?: string,
  ): Promise<TokensDto> {
    // Config values
    const accessTokenExpiry =
      this.configService.get<string>('ACCESS_TOKEN_EXPIRY') ?? '15m';
    const refreshTokenExpiryDays = Number(
      this.configService.get<string>('REFRESH_TOKEN_EXPIRY_DAYS') ?? 7,
    );
    const accessSecret = this.configService.getOrThrow<string>('JWT_SECRET');
    const refreshSecret =
      this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');

    // Generate access token
    const accessToken = this.jwtService.sign(
      { sub: userId, email },
      {
        secret: accessSecret,
        expiresIn: accessTokenExpiry as '15m' | '1h' | '7d',
      },
    );

    // Generate refresh token ID and calculate expiry
    const refreshTokenId = randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + refreshTokenExpiryDays);

    // Store in database
    await this.prisma.refreshToken.create({
      data: {
        token: refreshTokenId,
        userId,
        ip,
        deviceInfo,
        expiresAt,
      },
    });

    // Sign as JWT
    const refreshToken = this.jwtService.sign(
      { jti: refreshTokenId, type: 'refresh' },
      { secret: refreshSecret, expiresIn: `${refreshTokenExpiryDays}d` },
    );

    return { accessToken, refreshToken };
  }

  private toUserProfile(user: {
    id: string;
    email: string;
    fullName: string;
    emailVerified: boolean;
    role: Role;
  }): UserProfileDto {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      emailVerified: user.emailVerified,
      role: user.role,
    };
  }

  private getRegistrationCacheKey(email: string): string {
    return `reg:${email}`;
  }

  private async enforceResendRateLimits(email: string, ip?: string) {
    const ttlSeconds = this.configService.getOrThrow<number>(
      'REGISTRATION_TTL_SECONDS',
    );
    const cooldownSeconds = Number(
      this.configService.get<string>('REGISTRATION_RESEND_COOLDOWN_SECONDS') ??
        30,
    );
    const maxPerTtl = Number(
      this.configService.get<string>('REGISTRATION_RESEND_MAX_PER_TTL') ?? 5,
    );
    const maxPerIp = Number(
      this.configService.get<string>('REGISTRATION_RESEND_MAX_PER_IP') ?? 10,
    );

    const cooldownKey = `reg:resend:cooldown:${email}`;
    const inCooldown = await this.redis.exists(cooldownKey);
    if (inCooldown) {
      throw new HttpException(
        `${AUTH_ERRORS.OTP_RESEND_COOLDOWN}`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const countKey = `reg:resend:count:${email}`;
    const count = await this.redis.incr(countKey);
    if (count === 1) {
      await this.redis.expire(countKey, ttlSeconds);
    }
    if (count > maxPerTtl) {
      throw new HttpException(
        `${AUTH_ERRORS.OTP_RESEND_LIMIT_REACHED}`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (ip) {
      const ipHash = createHash('sha256').update(ip).digest('hex').slice(0, 16);
      const ipCountKey = `reg:resend:ip:${email}:${ipHash}`;
      const ipCount = await this.redis.incr(ipCountKey);
      if (ipCount === 1) {
        await this.redis.expire(ipCountKey, ttlSeconds);
      }
      if (ipCount > maxPerIp) {
        throw new HttpException(
          `${AUTH_ERRORS.OTP_RESEND_LIMIT_REACHED}`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    await this.redis.set(cooldownKey, '1', cooldownSeconds);
  }
}
