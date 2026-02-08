import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from 'src/prisma/prisma.service';
import { AUTH_ERRORS } from 'src/common/constants/error-messages';

export interface JwtPayload {
  sub: string; // userId
  email: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  emailVerified: boolean;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        fullName: true,
        emailVerified: true,
        role: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException(AUTH_ERRORS.UNAUTHORIZED);
    }

    return user;
  }
}
