import { Module, Global, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisService } from './redis.service';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService): Redis => {
        const logger = new Logger('RedisModule');

        const redis = new Redis({
          host: configService.getOrThrow<string>('REDIS_HOST'),
          port: configService.getOrThrow<number>('REDIS_PORT'),
          password: configService.getOrThrow<string>('REDIS_PASSWORD'),
          retryStrategy: (times) => {
            if (times > 10) {
              logger.error('Redis: Max reconnection attempts reached');
              return null; // Stop retrying
            }
            const delay = Math.min(times * 100, 3000);
            logger.warn(`Redis: Reconnecting in ${delay}ms (attempt ${times})`);
            return delay;
          },
        });

        redis.on('connect', () => {
          logger.log('Redis: Connected');
        });

        redis.on('error', (err) => {
          logger.error(`Redis Error: ${err.message}`);
        });

        redis.on('close', () => {
          logger.warn('Redis: Connection closed');
        });

        return redis;
      },
      inject: [ConfigService],
    },
    RedisService,
  ],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule implements OnModuleDestroy {
  constructor(private readonly redisService: RedisService) {}

  async onModuleDestroy() {
    await this.redisService.disconnect();
  }
}
