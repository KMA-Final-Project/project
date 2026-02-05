import { randomUUID } from 'crypto';
import {
  Injectable,
  ConflictException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from 'src/prisma/prisma.service';
import { RedisService } from 'src/modules/redis/redis.service';
import { MailService } from 'src/modules/mail/mail.service';
import { OtpService } from 'src/modules/otp/otp.service';
import {
  RegisterDto,
  VerifyRegistrationDto,
  LoginDto,
  AuthResponseDto,
  UserProfileDto,
  TokensDto,
} from './dto';
import { AUTH_ERRORS } from 'src/common/constants/error-messages';
import { OtpType } from 'prisma/generated/client';

interface CachedRegistration {
  email: string;
  passwordHash: string;
  fullName: string;
}

const REGISTRATION_TTL_SECONDS = 10 * 60; // 10 minutes
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly mail: MailService,
    private readonly otpService: OtpService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Step 1: Cache registration data in Redis + send OTP
   */
  async register(dto: RegisterDto): Promise<{ message: string }> {
    // Normalize email
    const email = dto.email.toLowerCase().trim();

    // Check if email already exists in database
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException(AUTH_ERRORS.USER_EMAIL_EXISTS);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Generate OTP via OtpService (for audit trail)
    const otp = await this.otpService.createOtp(email, OtpType.REGISTER);

    // Cache registration data in Redis
    const cacheKey = `reg:${email}`;
    const cacheData: CachedRegistration = {
      email,
      passwordHash,
      fullName: dto.fullName.trim(),
    };
    await this.redis.setJson(cacheKey, cacheData, REGISTRATION_TTL_SECONDS);

    // Send OTP email
    await this.mail.sendOtp(email, otp, OtpType.REGISTER);

    return {
      message:
        'Verification code sent to your email. Please verify within 10 minutes.',
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
    const cacheKey = `reg:${email}`;
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
    // Find the refresh token in database
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
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
   * Logout: invalidate the refresh token
   */
  async logout(refreshToken: string): Promise<{ message: string }> {
    await this.prisma.refreshToken.deleteMany({
      where: { token: refreshToken },
    });

    return { message: 'Logged out successfully' };
  }

  // --- Private Helper Methods ---

  private async generateTokens(
    userId: string,
    email: string,
    ip?: string,
    deviceInfo?: string,
  ): Promise<TokensDto> {
    const payload = { sub: userId, email };

    // Generate access token
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });

    // Generate refresh token using crypto.randomUUID (Node.js built-in)
    const refreshToken = randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

    // Store refresh token in database
    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId,
        ip,
        deviceInfo,
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }

  private toUserProfile(user: {
    id: string;
    email: string;
    fullName: string;
    emailVerified: boolean;
  }): UserProfileDto {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      emailVerified: user.emailVerified,
    };
  }
}
