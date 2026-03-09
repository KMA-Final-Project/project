import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { SocketGateway } from './socket.gateway';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { MediaService } from '../media/media.service';

type MediaUpdatePayload = {
  mediaId: string;
  userId: string;
};

@Injectable()
export class SocketService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SocketService.name);
  private subscriber: Redis;

  constructor(
    private readonly redisService: RedisService,
    private readonly socketGateway: SocketGateway,
    private readonly mediaService: MediaService,
    // We inject the redis client to duplicate it for subscribing
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async onModuleInit() {
    this.logger.log(
      'Initializing Redis Pub/Sub subscriber for WebSocket updates...',
    );
    // Create a dedicated Redis subscriber connection to listen for messages
    this.subscriber = this.redis.duplicate();

    await this.subscriber.subscribe('media_updates');

    this.subscriber.on('message', (channel: string, message: string) => {
      if (channel === 'media_updates') {
        void (async () => {
          try {
            const payload: MediaUpdatePayload = JSON.parse(message);
            const mediaId = payload.mediaId;
            const userId = payload.userId;

            if (!mediaId || !userId) {
              this.logger.warn(
                'Received invalid media_updates payload:',
                payload,
              );
              return;
            }

            // We fetch the full media status to emit to the client
            const media = await this.mediaService.getMediaStatus(
              userId,
              mediaId,
            );

            // Emit the update directly to the user's private room
            this.socketGateway.server
              .to(`user_${userId}`)
              .emit('media_updated', media);

            this.logger.debug(
              `Broadcasted update for media ${mediaId} to user_${userId}`,
            );
          } catch (error: unknown) {
            const msg =
              error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(
              `Failed to process media_updates message: ${msg}`,
            );
          }
        })();
      }
    });
  }

  async onModuleDestroy() {
    if (this.subscriber) {
      await this.subscriber.quit();
    }
  }
}
