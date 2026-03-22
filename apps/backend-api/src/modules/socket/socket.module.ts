import { Module } from '@nestjs/common';
import { AuthModule } from 'src/modules/auth/auth.module';
import { MediaModule } from 'src/modules/media/media.module';
import { RedisModule } from 'src/modules/redis/redis.module';
import { SocketGateway } from './socket.gateway';
import { SocketService } from './socket.service';

@Module({
  imports: [RedisModule, AuthModule, MediaModule],
  providers: [SocketGateway, SocketService],
  exports: [SocketService],
})
export class SocketModule {}
