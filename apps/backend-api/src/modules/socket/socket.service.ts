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
import { MediaService } from '../media/media.service';
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
  private messageProcessingChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly socketGateway: SocketGateway,
    private readonly mediaService: MediaService,
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

      this.messageProcessingChain = this.messageProcessingChain
        .then(() => this.handleMediaUpdate(message))
        .catch((error: unknown) => {
          const msg = error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(`Failed to process media_updates message: ${msg}`);
        });
    });
  }

  async onModuleDestroy() {
    if (this.subscriber) {
      await this.subscriber.quit();
    }
  }

  private async handleMediaUpdate(message: string): Promise<void> {
    const parsedPayload: unknown = JSON.parse(message);
    const event = parseMediaEvent(parsedPayload);

    if (!event) {
      this.logger.warn(
        `Received invalid media_updates payload: ${JSON.stringify(redactMediaPayload(parsedPayload))}`,
      );
      return;
    }

    await this.refreshArtifactSummaryCache(event).catch((error: unknown) => {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to refresh artifact summary cache for media ${event.mediaId}: ${msg}`,
      );
    });

    this.forwardEvent(event);
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

  private async refreshArtifactSummaryCache(event: MediaEvent): Promise<void> {
    switch (event.type) {
      case 'chunk_ready':
        await this.mediaService.recordChunkArtifact(
          event.mediaId,
          event.chunkIndex,
        );
        break;
      case 'batch_ready':
        await this.mediaService.recordTranslatedBatchArtifact(
          event.mediaId,
          event.batchIndex,
        );
        break;
      case 'completed':
        await this.mediaService.recordFinalArtifact(
          event.mediaId,
          event.transcriptS3Key,
        );
        break;
      default:
        break;
    }
  }
}
