import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { MediaService } from '../media/media.service';

interface MediaRoomPayload {
  mediaId?: string;
}

interface RoomSubscriptionAck {
  ok: boolean;
  room?: string;
  error?: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  pingInterval: 10000,
  pingTimeout: 5000,
})
export class SocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(SocketGateway.name);

  constructor(
    private readonly authService: AuthService,
    private readonly mediaService: MediaService,
  ) {}

  afterInit() {
    this.logger.log('WebSocket Gateway Initialized');
  }

  async handleConnection(client: Socket) {
    try {
      const authHeader =
        client.handshake.headers.authorization ||
        (client.handshake.auth?.token as string | undefined);

      if (!authHeader) {
        this.logger.warn(`No auth token provided. Disconnecting ${client.id}`);
        client.disconnect();
        return;
      }

      const token = authHeader.replace('Bearer ', '');
      const decoded = await this.authService.verifyAccessToken(token);

      if (!decoded?.sub) {
        this.logger.warn(`Invalid JWT. Disconnecting ${client.id}`);
        client.disconnect();
        return;
      }

      const userId = decoded.sub;
      this.setAuthenticatedUserId(client, userId);

      const roomName = this.getUserRoom(userId);
      await client.join(roomName);

      this.logger.log(`Client connected: ${client.id} -> Room: ${roomName}`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Connection error for ${client.id}: ${msg}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('media_join')
  async handleJoinMedia(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: MediaRoomPayload,
  ): Promise<RoomSubscriptionAck> {
    const userId = this.getAuthenticatedUserId(client);
    if (!userId) {
      return { ok: false, error: 'Unauthenticated socket' };
    }

    const mediaId = payload.mediaId?.trim();
    if (!mediaId) {
      return { ok: false, error: 'mediaId is required' };
    }

    try {
      const ownsMedia = await this.mediaService.isMediaOwnedByUser(
        userId,
        mediaId,
      );
      if (!ownsMedia) {
        this.logger.warn(
          `Rejected media room join for socket ${client.id}: user ${userId} does not own media ${mediaId}`,
        );
        return { ok: false, error: 'Media item not found' };
      }

      const roomName = this.getMediaRoom(mediaId);
      await client.join(roomName);

      this.logger.debug(
        `Client ${client.id} joined media room ${roomName} as user ${userId}`,
      );

      return { ok: true, room: roomName };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`media_join failed for ${client.id}: ${msg}`);
      return { ok: false, error: 'Unable to join media room' };
    }
  }

  @SubscribeMessage('media_leave')
  async handleLeaveMedia(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: MediaRoomPayload,
  ): Promise<RoomSubscriptionAck> {
    const mediaId = payload.mediaId?.trim();
    if (!mediaId) {
      return { ok: false, error: 'mediaId is required' };
    }

    const roomName = this.getMediaRoom(mediaId);
    await client.leave(roomName);

    this.logger.debug(`Client ${client.id} left media room ${roomName}`);

    return { ok: true, room: roomName };
  }

  private getAuthenticatedUserId(client: Socket): string | null {
    const data = client.data as { userId?: unknown };
    const userId = data.userId;

    return typeof userId === 'string' && userId.length > 0 ? userId : null;
  }

  private setAuthenticatedUserId(client: Socket, userId: string): void {
    const data = client.data as { userId?: string };
    data.userId = userId;
  }

  private getUserRoom(userId: string): string {
    return `user_${userId}`;
  }

  private getMediaRoom(mediaId: string): string {
    return `media_${mediaId}`;
  }
}
