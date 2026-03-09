import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';

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
  server: Server;

  private readonly logger = new Logger(SocketGateway.name);

  constructor(private readonly authService: AuthService) {}

  afterInit() {
    this.logger.log(`WebSocket Gateway Initialized`);
  }

  async handleConnection(client: Socket) {
    try {
      // Extract token from headers (standard) or auth payload
      const authHeader =
        client.handshake.headers.authorization ||
        (client.handshake.auth?.token as string);

      if (!authHeader) {
        this.logger.warn(`No auth token provided. Disconnecting ${client.id}`);
        client.disconnect();
        return;
      }

      const token = authHeader.replace('Bearer ', '');
      const decoded = await this.authService.verifyAccessToken(token);

      if (!decoded || !decoded.sub) {
        this.logger.warn(`Invalid JWT. Disconnecting ${client.id}`);
        client.disconnect();
        return;
      }

      const userId = decoded.sub;

      // Join the user to their private room
      const roomName = `user_${userId}`;
      await client.join(roomName);

      this.logger.log(`Client connected: ${client.id} -> Room: ${roomName}`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Connection error for ${client.id}:`, msg);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }
}
