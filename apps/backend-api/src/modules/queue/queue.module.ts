import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { QueueService } from './queue.service';
import { AI_PROCESSING_QUEUE, TRANSCRIPTION_QUEUE } from './queue.types';

@Module({
  imports: [
    BullModule.registerQueue({ name: TRANSCRIPTION_QUEUE }),
    BullModule.registerQueue({ name: AI_PROCESSING_QUEUE }),
  ],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
