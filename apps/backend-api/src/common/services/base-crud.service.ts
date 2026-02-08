import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Base CRUD Service providing common database operations.
 * Extend this class for entity-specific services.
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class PlanService extends BaseCrudService<
 *   SubscriptionPlan,
 *   CreatePlanDto,
 *   UpdatePlanDto
 * > {
 *   constructor(prisma: PrismaService) {
 *     super(prisma, 'subscriptionPlan', 'Plan');
 *   }
 * }
 * ```
 */
export abstract class BaseCrudService<
  TModel,
  TCreateDto = Partial<TModel>,
  TUpdateDto = Partial<TModel>,
> {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly modelName: string,
    protected readonly entityName: string = modelName,
  ) {}

  /**
   * Get the Prisma delegate for the model.
   * Uses type assertion to access dynamic model.
   */
  protected get model() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.prisma as any)[this.modelName];
  }

  /**
   * Find a single entity by ID.
   * @throws NotFoundException if entity doesn't exist
   */
  async findById(id: string): Promise<TModel> {
    const entity = await this.model.findUnique({ where: { id } });

    if (!entity) {
      throw new NotFoundException(
        `${this.entityName} with ID "${id}" not found`,
      );
    }

    return entity as TModel;
  }

  /**
   * Find a single entity by ID, returns null if not found.
   */
  async findByIdOrNull(id: string): Promise<TModel | null> {
    return this.model.findUnique({ where: { id } }) as Promise<TModel | null>;
  }

  /**
   * Find all entities with optional pagination.
   */
  async findAll(options?: {
    skip?: number;
    take?: number;
    orderBy?: Record<string, 'asc' | 'desc'>;
  }): Promise<TModel[]> {
    return this.model.findMany(options) as Promise<TModel[]>;
  }

  /**
   * Count entities matching optional filter.
   */
  async count(where?: Record<string, unknown>): Promise<number> {
    return this.model.count({ where });
  }

  /**
   * Check if an entity exists by ID.
   */
  async exists(id: string): Promise<boolean> {
    const count = await this.model.count({ where: { id } });
    return count > 0;
  }

  /**
   * Create a new entity. Override in subclass for custom logic.
   */
  abstract create(dto: TCreateDto): Promise<TModel>;

  /**
   * Update an entity. Override in subclass for custom logic.
   */
  abstract update(id: string, dto: TUpdateDto): Promise<TModel>;

  /**
   * Delete an entity. Override in subclass for soft-delete or cascade logic.
   */
  abstract delete(id: string): Promise<TModel | { message: string }>;
}
