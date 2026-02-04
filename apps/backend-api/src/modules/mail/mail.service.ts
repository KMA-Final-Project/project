import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { OtpType } from 'prisma/generated/client';

@Injectable()
export class MailService {
  constructor(private readonly mailerService: MailerService) {}

  /**
   * Send OTP email with template based on OTP type.
   */
  async sendOtp(email: string, otp: string, type: OtpType): Promise<void> {
    const templateConfig = this.getTemplateConfig(type);

    await this.mailerService.sendMail({
      to: email,
      subject: templateConfig.subject,
      template: templateConfig.template,
      context: {
        otp,
        expiresInMinutes: 10, // OTP validity duration
      },
    });
  }

  private getTemplateConfig(type: OtpType): {
    template: string;
    subject: string;
  } {
    switch (type) {
      case OtpType.REGISTER:
        return {
          template: 'register',
          subject: 'Verify Your Email - Bilingual App',
        };
      case OtpType.FORGOT_PASSWORD:
        return {
          template: 'forgot-password',
          subject: 'Password Reset Request - Bilingual App',
        };
      default:
        throw new Error(`Unknown OTP type: ${type as string}`);
    }
  }
}
