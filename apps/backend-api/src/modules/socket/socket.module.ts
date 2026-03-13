import { Module } from '@nestjs/common';
import { SocketGateway } from './socket.gateway';
import { SocketService } from './socket.service';
import { RedisModule } from 'src/modules/redis/redis.module';
import { AuthModule } from 'src/modules/auth/auth.module';

@Module({
  imports: [RedisModule, AuthModule],
  providers: [SocketGateway, SocketService],
  exports: [SocketService],
})
export class SocketModule {}
