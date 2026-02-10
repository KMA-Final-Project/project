import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';

/**
 * Standalone NestJS Worker Application.
 *
 * This is a SEPARATE process from the API (main.ts).
 * It does NOT listen on an HTTP port — it only connects to Redis
 * to consume BullMQ jobs from the 'transcription' queue.
 *
 * Run with: pnpm run worker:dev (development) or pnpm run worker (production)
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Worker');

  // createApplicationContext = standalone app (no HTTP server)
  const app = await NestFactory.createApplicationContext(WorkerModule);

  // Graceful shutdown: finish current job before exiting
  app.enableShutdownHooks();

  // Handle termination signals
  const shutdown = async (signal: string): Promise<void> => {
    logger.log(`Received ${signal}. Shutting down gracefully...`);
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  logger.log('Worker is running. Waiting for jobs...');
}

void bootstrap();
