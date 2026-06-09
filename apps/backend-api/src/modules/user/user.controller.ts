import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { AuthenticatedUser } from 'src/modules/auth/strategies/jwt.strategy';
import { SubscriptionStatusResponseDto } from './dto';
import { UserSubscriptionStatusService } from './services';

@ApiTags('User')
@Controller('user')
export class UserController {
  constructor(
    private readonly subscriptionStatusService: UserSubscriptionStatusService,
  ) {}

  @Get('subscription-status')
  @ApiOkResponse({ type: SubscriptionStatusResponseDto })
  getSubscriptionStatus(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SubscriptionStatusResponseDto> {
    return this.subscriptionStatusService.getSubscriptionStatus(user.id);
  }
}
