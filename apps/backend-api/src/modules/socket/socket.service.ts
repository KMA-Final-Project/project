import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Inject,
} from '@nestjs/common';
import { Redis } from 'ioredis';
import { SocketGateway } from './socket.gateway';
import { REDIS_CLIENT } from '../redis/redis.constants';
import {
  type MediaEvent,
  getSocketEventName,
  parseMediaEvent,
  redactMediaPayload,
} from './socket.types';

@Injectable()
export class SocketService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SocketService.name);
  private subscriber!: Redis;

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
      if (channel !== 'media_updates') {
        return;
      }

      this.handleMediaUpdate(message);
    });
  }

  async onModuleDestroy() {
    if (this.subscriber) {
      await this.subscriber.quit();
    }
  }

  private handleMediaUpdate(message: string): void {
    try {
      const parsedPayload: unknown = JSON.parse(message);
      const event = parseMediaEvent(parsedPayload);

      if (!event) {
        this.logger.warn(
          `Received invalid media_updates payload: ${JSON.stringify(redactMediaPayload(parsedPayload))}`,
        );
        return;
      }

      this.forwardEvent(event);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to process media_updates message: ${msg}`);
    }
  }

  private forwardEvent(event: MediaEvent): void {
    const socketEventName = getSocketEventName(event);
    const userRoom = this.getUserRoom(event.userId);
    const mediaRoom = this.getMediaRoom(event.mediaId);

    this.socketGateway.server
      .to(userRoom)
      .to(mediaRoom)
      .emit(socketEventName, event);

    this.logger.debug(
      `Forwarded "${event.type}" event for media ${event.mediaId} → ${userRoom}, ${mediaRoom}`,
    );
  }

  getUserRoom(userId: string): string {
    return `user_${userId}`;
  }

  getMediaRoom(mediaId: string): string {
    return `media_${mediaId}`;
  }
}
