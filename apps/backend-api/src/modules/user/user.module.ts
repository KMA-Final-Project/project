import { Module } from '@nestjs/common';
import {
  UserSubscriptionService,
  UserSubscriptionStatusService,
} from './services';
import { PrismaService } from 'src/prisma/prisma.service';
import { UserController } from './user.controller';

@Module({
  controllers: [UserController],
  providers: [
    UserSubscriptionService,
    UserSubscriptionStatusService,
    PrismaService,
  ],
  exports: [UserSubscriptionService, UserSubscriptionStatusService],
})
export class UserModule {}
