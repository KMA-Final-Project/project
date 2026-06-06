import { Module } from '@nestjs/common';
import { QueueModule } from 'src/modules/queue/queue.module';
import { UserModule } from 'src/modules/user/user.module';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { YtDlpService } from './yt-dlp.service';

@Module({
  imports: [QueueModule, UserModule],
  controllers: [MediaController],
  providers: [MediaService, YtDlpService],
  exports: [MediaService],
})
export class MediaModule {}
