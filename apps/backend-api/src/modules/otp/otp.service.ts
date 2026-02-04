import { Injectable } from '@nestjs/common';
import { OtpType } from 'prisma/generated/client';
import { PrismaService } from 'src/prisma/prisma.service';

const OTP_EXPIRY_MINUTES = 10;

@Injectable()
export class OtpService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a 6-digit OTP and store it in the database.
   * Invalidates any existing OTPs for the same email and type.
   */
  async createOtp(
    email: string,
    type: OtpType,
    userId?: string,
  ): Promise<string> {
    const code = this.generateOtpCode();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Invalidate existing OTPs for this email and type
    await this.prisma.otp.deleteMany({
      where: { email, type },
    });

    // Create new OTP
    await this.prisma.otp.create({
      data: {
        email,
        code,
        type,
        expiresAt,
        userId,
      },
    });

    return code;
  }

  /**
   * Verify an OTP code.
   * Returns true if valid, false otherwise.
   * Marks OTP as verified if successful.
   */
  async verifyOtp(
    email: string,
    code: string,
    type: OtpType,
  ): Promise<boolean> {
    const otp = await this.prisma.otp.findFirst({
      where: {
        email,
        code,
        type,
        verified: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (!otp) {
      return false;
    }

    // Mark as verified
    await this.prisma.otp.update({
      where: { id: otp.id },
      data: { verified: true },
    });

    return true;
  }

  /**
   * Get a valid (unverified, not expired) OTP for an email and type.
   * Useful for resending OTP without generating a new one.
   */
  async getValidOtp(
    email: string,
    type: OtpType,
  ): Promise<{ code: string; expiresAt: Date } | null> {
    const otp = await this.prisma.otp.findFirst({
      where: {
        email,
        type,
        verified: false,
        expiresAt: { gt: new Date() },
      },
      select: { code: true, expiresAt: true },
    });

    return otp;
  }

  /**
   * Clean up expired and verified OTPs.
   * Should be called periodically (e.g., via cron job).
   */
  async cleanupExpiredOtps(): Promise<number> {
    const result = await this.prisma.otp.deleteMany({
      where: {
        OR: [{ verified: true }, { expiresAt: { lte: new Date() } }],
      },
    });

    return result.count;
  }

  private generateOtpCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}
