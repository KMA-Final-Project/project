/**
 * Injection token for the Redis client instance.
 * Separated from redis.module.ts to avoid circular imports.
 */
export const REDIS_CLIENT = 'REDIS_CLIENT';
