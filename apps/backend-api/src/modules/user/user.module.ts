import { Module } from '@nestjs/common';
import { UserSubscriptionService } from './services';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  providers: [UserSubscriptionService, PrismaService],
  exports: [UserSubscriptionService],
})
export class UserModule {}
