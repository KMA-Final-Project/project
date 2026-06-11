import {
  Controller,
  Post,
  Body,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  VerifyRegistrationDto,
  LoginDto,
  RefreshTokenDto,
  AuthResponseDto,
  MessageResponseDto,
  TokensDto,
  MobileWebHandoffDto,
  MobileWebHandoffResponseDto,
  MobileWebHandoffConsumeDto,
} from './dto';
import { ResendRegistrationOtpDto } from './dto/resend-registration-otp.dto';
import {
  ForgotPasswordDto,
  ResendForgotPasswordOtpDto,
  ResetPasswordDto,
} from './dto/forgot-password.dto';
import { Public } from '../../common/decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } }) // 3 requests per minute
  @Post('register')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register new user - sends OTP to email' })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async register(@Body() dto: RegisterDto): Promise<MessageResponseDto> {
    return this.authService.register(dto);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('resend-registration-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resend registration OTP using cached registration session',
  })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Registration session expired. Register again.',
  })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  @ApiResponse({
    status: 429,
    description: 'Resend cooldown/rate limit reached',
  })
  async resendRegistrationOtp(
    @Body() dto: ResendRegistrationOtpDto,
    @Req() req: Request,
  ): Promise<MessageResponseDto> {
    const ip = this.getClientIp(req);
    return this.authService.resendRegistrationOtp(dto, ip);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 requests per minute
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP and complete registration' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async verify(
    @Body() dto: VerifyRegistrationDto,
    @Req() req: Request,
  ): Promise<AuthResponseDto> {
    const ip = this.getClientIp(req);
    const deviceInfo = this.getDeviceInfo(req);
    return this.authService.verifyRegistration(dto, ip, deviceInfo);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 requests per minute
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Registration pending verification (OTP not completed)',
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
  ): Promise<AuthResponseDto> {
    const ip = this.getClientIp(req);
    const deviceInfo = this.getDeviceInfo(req);
    return this.authService.login(dto, ip, deviceInfo);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 requests per minute
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiResponse({ status: 200, type: TokensDto })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
  ): Promise<TokensDto> {
    const ip = this.getClientIp(req);
    const deviceInfo = this.getDeviceInfo(req);
    return this.authService.refreshTokens(dto.refreshToken, ip, deviceInfo);
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout - invalidate refresh token' })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async logout(@Body() dto: RefreshTokenDto): Promise<MessageResponseDto> {
    return this.authService.logout(dto.refreshToken);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset OTP' })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Req() req: Request,
  ): Promise<MessageResponseDto> {
    const ip = this.getClientIp(req);
    return this.authService.forgotPassword(dto, ip);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('resend-forgot-password-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend password reset OTP' })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async resendForgotPasswordOtp(
    @Body() dto: ResendForgotPasswordOtpDto,
    @Req() req: Request,
  ): Promise<MessageResponseDto> {
    const ip = this.getClientIp(req);
    return this.authService.resendForgotPasswordOtp(dto, ip);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with OTP' })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<MessageResponseDto> {
    return this.authService.resetPassword(dto);
  }

  @ApiBearerAuth()
  @Post('mobile-web-handoff')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Create a one-time handoff URL for mobile-to-web billing',
  })
  @ApiResponse({ status: 200, type: MobileWebHandoffResponseDto })
  async createMobileWebHandoff(
    @CurrentUser() user: { id: string },
    @Body() dto: MobileWebHandoffDto,
  ): Promise<MobileWebHandoffResponseDto> {
    return this.authService.createMobileWebHandoff(user.id, dto.target);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('mobile-web-handoff/consume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Consume a one-time mobile-web handoff token' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  async consumeMobileWebHandoff(
    @Body() dto: MobileWebHandoffConsumeDto,
  ): Promise<AuthResponseDto> {
    return this.authService.consumeMobileWebHandoff(dto.token);
  }

  private getClientIp(req: Request): string | undefined {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return req.ip;
  }

  private getDeviceInfo(req: Request): string | undefined {
    const customDevice = req.headers['x-device-info'];
    if (typeof customDevice === 'string') return customDevice;
    return req.headers['user-agent'];
  }
}
