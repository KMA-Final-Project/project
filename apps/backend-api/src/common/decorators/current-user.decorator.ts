import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from 'src/modules/auth/strategies/jwt.strategy';

/**
 * Parameter decorator that extracts the authenticated user from the request.
 * Usage: @CurrentUser() user: AuthenticatedUser
 *
 * The user object is populated by JwtStrategy.validate() via Passport.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user: AuthenticatedUser }>();
    return request.user;
  },
);
