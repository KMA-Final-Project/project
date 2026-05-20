import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { OverviewService, PlanService, VariantService, UserAdminService } from './services';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueueModule } from 'src/modules/queue/queue.module';

@Module({
  imports: [QueueModule],
  controllers: [AdminController],
  providers: [OverviewService, PlanService, VariantService, UserAdminService, PrismaService],
  exports: [OverviewService, PlanService, VariantService, UserAdminService],
})
export class AdminModule {}
