import { SetMetadata } from '@nestjs/common';
import { Role } from 'prisma/generated/client';

export const ROLES_KEY = 'roles';

/**
 * Decorator to specify which roles can access a route.
 * @example @Roles(Role.ADMIN)
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
