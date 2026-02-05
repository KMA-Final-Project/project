import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Mark an endpoint as public (no authentication required).
 * Use this decorator on routes that should bypass JWT authentication.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
