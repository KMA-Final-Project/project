import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { PlanService, VariantService } from './services';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  controllers: [AdminController],
  providers: [PlanService, VariantService, PrismaService],
  exports: [PlanService, VariantService],
})
export class AdminModule {}
