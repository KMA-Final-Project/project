import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
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
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import {
  OverviewService,
  PlanService,
  VariantService,
  UserAdminService,
  AiExplainAdminService,
  MonitoringAdminService,
} from './services';
import {
  CreatePlanDto,
  UpdatePlanDto,
  AdminPlanDetailDto,
} from './dto/plan.dto';
import { CreateVariantDto, UpdateVariantDto } from './dto/variant.dto';
import { AdminOverviewDto } from './dto/overview.dto';
import {
  AdminUsersQueryDto,
  AdminUserListResponseDto,
  AdminUserDetailDto,
  UpdateAdminUserRoleDto,
  AdminUserRoleUpdateResultDto,
} from './dto/user.dto';
import {
  AiExplainMetricsDto,
  AiExplainMetricsQueryDto,
  AiExplainSessionsQueryDto,
  AiExplainSessionsResponseDto,
} from './dto/ai-explain.dto';
import {
  AdminMonitoringQueueOverviewDto,
  AdminMonitoringFailuresQueryDto,
  AdminMonitoringFailuresResponseDto,
  AdminTranslationFinalizationSummaryQueryDto,
  AdminTranslationFinalizationSummaryResponseDto,
  AdminTranslationFinalizationMediaQueryDto,
  AdminTranslationFinalizationMediaListResponseDto,
} from './dto/monitoring.dto';
import { ErrorResponseDto } from 'src/common/dto';

@ApiTags('Admin - Subscription Plans')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly overviewService: OverviewService,
    private readonly planService: PlanService,
    private readonly variantService: VariantService,
    private readonly userAdminService: UserAdminService,
    private readonly aiExplainAdminService: AiExplainAdminService,
    private readonly monitoringAdminService: MonitoringAdminService,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get admin dashboard overview metrics' })
  @ApiResponse({ status: 200, type: AdminOverviewDto })
  async getOverview(): Promise<AdminOverviewDto> {
    return this.overviewService.getOverview();
  }

  // ==================== USERS ====================

  @Get('users')
  @ApiOperation({ summary: 'Paginated admin user list' })
  @ApiResponse({ status: 200, type: AdminUserListResponseDto })
  async findAllUsers(
    @Query() query: AdminUsersQueryDto,
  ): Promise<AdminUserListResponseDto> {
    return this.userAdminService.findAll(query);
  }

  @Get('users/:id')
  @ApiOperation({
    summary: 'User detail: profile + subscription + usage history',
  })
  @ApiResponse({ status: 200, type: AdminUserDetailDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async findUserById(@Param('id') id: string): Promise<AdminUserDetailDto> {
    return this.userAdminService.findById(id);
  }

  @Patch('users/:id/role')
  @ApiOperation({ summary: 'Change a user role (USER/ADMIN)' })
  @ApiResponse({ status: 200, type: AdminUserRoleUpdateResultDto })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async updateUserRole(
    @Param('id') id: string,
    @Body() dto: UpdateAdminUserRoleDto,
    @CurrentUser() currentUser: { id: string },
  ): Promise<AdminUserRoleUpdateResultDto> {
    return this.userAdminService.updateRole(id, currentUser.id, dto.role);
  }

  // ==================== AI EXPLAIN ====================

  @Get('ai-explain/metrics')
  @ApiOperation({ summary: 'Get Kapter Explain usage and quality metrics' })
  @ApiResponse({ status: 200, type: AiExplainMetricsDto })
  async getAiExplainMetrics(
    @Query() query: AiExplainMetricsQueryDto,
  ): Promise<AiExplainMetricsDto> {
    return this.aiExplainAdminService.getMetrics(query);
  }

  @Get('ai-explain/sessions')
  @ApiOperation({ summary: 'Paginated Kapter Explain chat sessions' })
  @ApiResponse({ status: 200, type: AiExplainSessionsResponseDto })
  async getAiExplainSessions(
    @Query() query: AiExplainSessionsQueryDto,
  ): Promise<AiExplainSessionsResponseDto> {
    return this.aiExplainAdminService.getSessions(query);
  }

  // ==================== MONITORING ====================

  @Get('monitoring/queues')
  @ApiOperation({ summary: 'Queue health overview for monitoring' })
  @ApiResponse({ status: 200, type: AdminMonitoringQueueOverviewDto })
  async getMonitoringQueues(): Promise<AdminMonitoringQueueOverviewDto> {
    return this.monitoringAdminService.getQueueOverview();
  }

  @Get('monitoring/failures')
  @ApiOperation({
    summary: 'Paginated failure diagnostics (media or queue source)',
  })
  @ApiResponse({ status: 200, type: AdminMonitoringFailuresResponseDto })
  async getMonitoringFailures(
    @Query() query: AdminMonitoringFailuresQueryDto,
  ): Promise<AdminMonitoringFailuresResponseDto> {
    return this.monitoringAdminService.getFailures(query);
  }

  @Get('monitoring/translation-finalization/summary')
  @ApiOperation({ summary: 'Translation finalization usage and cost summary' })
  @ApiResponse({
    status: 200,
    type: AdminTranslationFinalizationSummaryResponseDto,
  })
  async getTranslationFinalizationSummary(
    @Query() query: AdminTranslationFinalizationSummaryQueryDto,
  ): Promise<AdminTranslationFinalizationSummaryResponseDto> {
    return this.monitoringAdminService.getTranslationFinalizationSummary(query);
  }

  @Get('monitoring/translation-finalization/media')
  @ApiOperation({
    summary: 'Paginated recent media with translation finalization telemetry',
  })
  @ApiResponse({
    status: 200,
    type: AdminTranslationFinalizationMediaListResponseDto,
  })
  async getTranslationFinalizationMedia(
    @Query() query: AdminTranslationFinalizationMediaQueryDto,
  ): Promise<AdminTranslationFinalizationMediaListResponseDto> {
    return this.monitoringAdminService.getTranslationFinalizationMedia(query);
  }

  // ==================== PLANS ====================

  @Get('plans')
  @ApiOperation({ summary: 'List all subscription plans with variants' })
  @ApiResponse({ status: 200, description: 'Returns all plans' })
  async findAllPlans() {
    return this.planService.findAllWithVariants();
  }

  @Get('plans/:id')
  @ApiOperation({ summary: 'Get a subscription plan by ID with metrics' })
  @ApiResponse({ status: 200, type: AdminPlanDetailDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async findPlanById(@Param('id') id: string) {
    return this.planService.findByIdWithMetrics(id);
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
