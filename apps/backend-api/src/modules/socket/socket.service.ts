import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { SocketGateway } from './socket.gateway';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import type { MediaEvent } from './socket.types';

@Injectable()
export class SocketService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SocketService.name);
  private subscriber: Redis;

  constructor(
    private readonly socketGateway: SocketGateway,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async onModuleInit() {
    this.logger.log(
      'Initializing Redis Pub/Sub subscriber for WebSocket updates...',
    );
    this.subscriber = this.redis.duplicate();

    await this.subscriber.subscribe('media_updates');

    this.subscriber.on('message', (channel: string, message: string) => {
      if (channel !== 'media_updates') return;

      try {
        const event = JSON.parse(message) as MediaEvent;

        if (!event.mediaId || !event.userId) {
          this.logger.warn('Received invalid media_updates payload:', event);
          return;
        }

        const room = `user_${event.userId}`;

        switch (event.type) {
          case 'progress':
            this.socketGateway.server.to(room).emit('media_progress', event);
            break;
          case 'chunk_ready':
            this.socketGateway.server.to(room).emit('media_chunk_ready', event);
            break;
          case 'batch_ready':
            this.socketGateway.server.to(room).emit('media_batch_ready', event);
            break;
          case 'completed':
            this.socketGateway.server.to(room).emit('media_completed', event);
            break;
          case 'failed':
            this.socketGateway.server.to(room).emit('media_failed', event);
            break;
          default:
            this.logger.warn(
              `Unknown media event type: ${(event as MediaEvent & { type: string }).type}`,
            );
        }

        this.logger.debug(
          `Forwarded "${event.type}" event for media ${event.mediaId} → ${room}`,
        );
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Failed to process media_updates message: ${msg}`);
      }
    });
  }

  async onModuleDestroy() {
    if (this.subscriber) {
      await this.subscriber.quit();
    }
  }
}
