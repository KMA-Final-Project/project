import { Module } from '@nestjs/common';
import { QueueModule } from 'src/modules/queue/queue.module';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { YtDlpService } from './yt-dlp.service';

@Module({
  imports: [QueueModule],
  controllers: [MediaController],
  providers: [MediaService, YtDlpService],
  exports: [MediaService],
})
export class MediaModule {}
