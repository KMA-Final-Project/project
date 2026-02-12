/**
 * Clean Test Environment Script
 *
 * Flushes BullMQ queues, clears MinIO buckets, and resets media items in DB.
 * Usage: pnpm clean:env
 */

import 'dotenv/config'; // Load .env BEFORE anything else

import { Queue } from 'bullmq';
import { Client as MinioClient } from 'minio';
import { PrismaClient } from 'prisma/generated/client';
import { PrismaPg } from '@prisma/adapter-pg';

// ─── Config (matches .env) ───────────────────────────────────────────────────

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD =
  process.env.REDIS_PASSWORD || 'bilingual_redis_secret_2026';

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'localhost';
const MINIO_PORT = parseInt(process.env.MINIO_PORT || '9000', 10);
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || 'sondoannam';
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || '20052002@Zz';

const QUEUE_PREFIX = 'bilingual';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function flushQueues() {
  console.log('\n🗑️  Flushing BullMQ queues...');

  const redisOpts = {
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD || undefined,
  };

  const queues = ['transcription', 'ai-processing'];

  for (const name of queues) {
    const queue = new Queue(name, {
      connection: redisOpts,
      prefix: QUEUE_PREFIX,
    });

    // Drain all jobs (waiting + delayed)
    await queue.drain();

    // Obliterate removes ALL data including completed/failed
    await queue.obliterate({ force: true });

    console.log(`   ✅ Queue "${name}" obliterated`);
    await queue.close();
  }
}

async function clearMinioBuckets() {
  console.log('\n🪣  Clearing MinIO buckets...');

  const client = new MinioClient({
    endPoint: MINIO_ENDPOINT,
    port: MINIO_PORT,
    accessKey: MINIO_ACCESS_KEY,
    secretKey: MINIO_SECRET_KEY,
    useSSL: false,
  });

  const buckets = ['raw', 'processed'];

  for (const bucketName of buckets) {
    const exists = await client.bucketExists(bucketName);
    if (!exists) {
      console.log(`   ⏭️  Bucket "${bucketName}" doesn't exist, skipping`);
      continue;
    }

    // List and delete all objects
    const objectsList: string[] = [];
    const stream = client.listObjects(bucketName, '', true);

    await new Promise<void>((resolve, reject) => {
      stream.on('data', (obj) => {
        if (obj.name) objectsList.push(obj.name);
      });
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    if (objectsList.length > 0) {
      await client.removeObjects(bucketName, objectsList);
      console.log(
        `   ✅ Bucket "${bucketName}": deleted ${objectsList.length} objects`,
      );
    } else {
      console.log(`   ✅ Bucket "${bucketName}": already empty`);
    }
  }
}

async function resetDatabase() {
  console.log('\n🗃️  Resetting media items in database...');

  const pool = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter: pool });

  try {
    // Delete all media items (hard delete for clean testing)
    const result = await prisma.mediaItem.deleteMany({});
    console.log(`   ✅ Deleted ${result.count} media items`);
  } finally {
    await prisma.$disconnect();
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🧹 Clean Test Environment');
  console.log('═'.repeat(50));

  try {
    await flushQueues();
    await clearMinioBuckets();
    await resetDatabase();

    console.log('\n' + '═'.repeat(50));
    console.log('✨ Environment is clean! Ready for testing.');
  } catch (error) {
    console.error('\n❌ Cleanup failed:', error);
    process.exit(1);
  }
}

void main();
