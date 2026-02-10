import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { PrismaService } from './prisma/prisma.service';
import { MediaProcessor } from './modules/media/workers/media.processor';
import { TRANSCRIPTION_QUEUE } from './modules/queue/queue.types';

/**
 * Lean Worker Module — imports ONLY what the consumer needs.
 *
 * Deliberately excludes API-only concerns:
 * - No ThrottlerModule (no HTTP rate limiting)
 * - No AuthModule / JwtAuthGuard (no HTTP authentication)
 * - No MailModule / OtpModule (no email sending)
 * - No HTTP Controllers
 *
 * Shares the same BullMQ + Redis config as AppModule.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    // BullMQ — same config as AppModule (shared Redis)
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.getOrThrow<string>('REDIS_HOST'),
          port: configService.getOrThrow<number>('REDIS_PORT'),
          password: configService.getOrThrow<string>('REDIS_PASSWORD'),
        },
        prefix: 'bilingual',
      }),
      inject: [ConfigService],
    }),

    // Register the queue this worker consumes from
    BullModule.registerQueue({ name: TRANSCRIPTION_QUEUE }),
  ],
  providers: [PrismaService, MediaProcessor],
})
export class WorkerModule {}
