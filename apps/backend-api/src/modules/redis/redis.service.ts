import { Injectable, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

@Injectable()
export class RedisService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Set a key-value pair with optional TTL (in seconds).
   */
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.redis.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.redis.set(key, value);
    }
  }

  /**
   * Get a value by key.
   */
  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  /**
   * Delete a key.
   */
  async del(key: string): Promise<number> {
    return this.redis.del(key);
  }

  /**
   * Increment a counter (useful for rate limiting).
   */
  async incr(key: string): Promise<number> {
    return this.redis.incr(key);
  }

  /**
   * Set expiration on an existing key.
   */
  async expire(key: string, seconds: number): Promise<number> {
    return this.redis.expire(key, seconds);
  }

  /**
   * Get TTL of a key (in seconds).
   */
  async ttl(key: string): Promise<number> {
    return this.redis.ttl(key);
  }

  /**
   * Check if a key exists.
   */
  async exists(key: string): Promise<boolean> {
    const result = await this.redis.exists(key);
    return result === 1;
  }

  /**
   * Set JSON object with optional TTL.
   */
  async setJson<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttlSeconds);
  }

  /**
   * Get and parse JSON object.
   */
  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  /**
   * Disconnect from Redis.
   */
  async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}
