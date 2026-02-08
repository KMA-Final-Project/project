import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Role } from 'prisma/generated/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PlanService, VariantService } from './services';
import { CreatePlanDto, UpdatePlanDto } from './dto/plan.dto';
import { CreateVariantDto, UpdateVariantDto } from './dto/variant.dto';
import { ErrorResponseDto } from '../../common/dto';

@ApiTags('Admin - Subscription Plans')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly planService: PlanService,
    private readonly variantService: VariantService,
  ) {}

  // ==================== PLANS ====================

  @Get('plans')
  @ApiOperation({ summary: 'List all subscription plans with variants' })
  @ApiResponse({ status: 200, description: 'Returns all plans' })
  async findAllPlans() {
    return this.planService.findAllWithVariants();
  }

  @Get('plans/:id')
  @ApiOperation({ summary: 'Get a subscription plan by ID' })
  @ApiResponse({ status: 200, description: 'Returns the plan' })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async findPlanById(@Param('id') id: string) {
    return this.planService.findByIdWithVariants(id);
  }

  @Post('plans')
  @ApiOperation({ summary: 'Create a new subscription plan' })
  @ApiResponse({ status: 201, description: 'Plan created' })
  @ApiResponse({ status: 409, type: ErrorResponseDto })
  async createPlan(@Body() dto: CreatePlanDto) {
    return this.planService.create(dto);
  }

  @Patch('plans/:id')
  @ApiOperation({
    summary: 'Update plan metadata (name, description, features)',
  })
  @ApiResponse({ status: 200, description: 'Plan updated' })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.planService.update(id, dto);
  }

  @Delete('plans/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Soft-delete a plan (deactivates plan and variants)',
  })
  @ApiResponse({ status: 200, description: 'Plan deactivated' })
  @ApiResponse({
    status: 400,
    type: ErrorResponseDto,
    description: 'Has active subscribers',
  })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async deletePlan(@Param('id') id: string) {
    return this.planService.delete(id);
  }

  // ==================== VARIANTS ====================

  @Post('plans/:planId/variants')
  @ApiOperation({ summary: 'Add a new variant to a plan' })
  @ApiResponse({ status: 201, description: 'Variant created' })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async createVariant(
    @Param('planId') planId: string,
    @Body() dto: CreateVariantDto,
  ) {
    return this.variantService.createForPlan(planId, dto);
  }

  @Patch('variants/:id')
  @ApiOperation({
    summary: 'Update a variant (creates new version if has subscribers)',
    description:
      'If the variant has active subscribers and you change price/limits, a new variant version will be created and the old one disabled.',
  })
  @ApiResponse({
    status: 200,
    description: 'Variant updated or new version created',
  })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async updateVariant(@Param('id') id: string, @Body() dto: UpdateVariantDto) {
    return this.variantService.update(id, dto);
  }

  @Delete('variants/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete or deactivate a variant' })
  @ApiResponse({ status: 200, description: 'Variant deleted/deactivated' })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async deleteVariant(@Param('id') id: string) {
    return this.variantService.delete(id);
  }
}
