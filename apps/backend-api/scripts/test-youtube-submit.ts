import 'dotenv/config';

import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from 'prisma/generated/client';
import { BillingCycleType } from 'prisma/generated/enums';

const TEST_EMAIL = 'sondoannam202@gmail.com';
const TEST_PASSWORD = 'Test@123';
const TEST_FULL_NAME = 'Bilingual Test User';
const TEST_YOUTUBE_URL = 'https://www.youtube.com/watch?v=-moW9jvvMr4';
const POLL_INTERVAL_MS = 10_000;
const THROTTLE_BACKOFF_MS = 20_000;
const TIMEOUT_MS = 10 * 60 * 1_000;

type LoginResponse = {
  user: {
    id: string;
    email: string;
    fullName: string;
    emailVerified: boolean;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
};

type SubmitYoutubeResponse = {
  id: string;
  title: string;
  status: string;
  originUrl: string | null;
  jobId: string;
};

type MediaStatusResponse = {
  id: string;
  title: string;
  status: string;
  progress: number;
  sourceLanguage: string | null;
  durationSeconds: number;
  failReason: string | null;
  currentStep: string | null;
  estimatedTimeRemaining: number | null;
  artifacts?: {
    chunkCount: number;
    translatedBatchCount: number;
    hasFinal: boolean;
    latestChunkIndex: number | null;
    latestBatchIndex: number | null;
    finalObjectKey: string | null;
  };
};

type MediaArtifactsResponse = {
  mediaId: string;
  status: string;
  summary: {
    chunkCount: number;
    translatedBatchCount: number;
    hasFinal: boolean;
    latestChunkIndex: number | null;
    latestBatchIndex: number | null;
    finalObjectKey: string | null;
  };
  final: {
    objectKey: string;
    url: string;
    size: number;
    lastModified: string | null;
  } | null;
};

type FinalArtifact = {
  metadata: {
    duration: number;
    engine_profile: string;
    source_lang: string;
    target_lang: string;
    model_used: string;
  };
  segments: Array<{
    text: string;
    translation: string;
    start: number;
    end: number;
  }>;
};

const DATABASE_URL = process.env.DATABASE_URL;
const API_PREFIX = (process.env.API_PREFIX ?? 'api').replace(/^\/+|\/+$/g, '');
const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);
const BASE_URL = `http://localhost:${PORT}/${API_PREFIX}`;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required to run test:youtube');
}

const pool = new PrismaPg({ connectionString: DATABASE_URL });
const prisma = new PrismaClient({ adapter: pool });

async function ensureTestUser(): Promise<void> {
  const existing = await prisma.user.findUnique({
    where: { email: TEST_EMAIL },
    select: {
      id: true,
      currentSubscriptionId: true,
    },
  });

  const passwordHash = bcrypt.hashSync(TEST_PASSWORD, 12);
  const proVariant = await prisma.planVariant.findFirst({
    where: {
      plan: { code: 'pro' },
      billingCycleType: BillingCycleType.MONTHLY,
      isActive: true,
    },
    select: {
      id: true,
      price: true,
      maxDurationPerFile: true,
      monthlyQuotaSeconds: true,
    },
  });

  if (!proVariant) {
    throw new Error(
      'Active PRO_MONTHLY variant not found. Seed the database first.',
    );
  }

  const farFuture = new Date('9999-12-31T23:59:59.999Z');

  if (!existing) {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: TEST_EMAIL,
          fullName: TEST_FULL_NAME,
          passwordHash,
          emailVerified: true,
          quotaUsageCurrentMonth: 0,
          quotaUsageCurrentMonthSeconds: 0,
        },
        select: { id: true },
      });

      const subscription = await tx.subscription.create({
        data: {
          userId: user.id,
          variantId: proVariant.id,
          startDate: new Date(),
          endDate: farFuture,
          status: 'ACTIVE',
          priceSnapshot: proVariant.price,
          maxDurationPerFileSnapshot: proVariant.maxDurationPerFile,
          monthlyQuotaSecondsSnapshot: proVariant.monthlyQuotaSeconds,
        },
        select: { id: true },
      });

      await tx.user.update({
        where: { id: user.id },
        data: { currentSubscriptionId: subscription.id },
      });
    });

    console.log(`Created test user ${TEST_EMAIL}`);
    return;
  }

  await prisma.user.update({
    where: { id: existing.id },
    data: {
      fullName: TEST_FULL_NAME,
      passwordHash,
      emailVerified: true,
      quotaUsageCurrentMonth: 0,
      quotaUsageCurrentMonthSeconds: 0,
      lastQuotaResetDate: new Date(),
    },
  });

  if (existing.currentSubscriptionId) {
    await prisma.subscription.update({
      where: { id: existing.currentSubscriptionId },
      data: {
        variantId: proVariant.id,
        status: 'ACTIVE',
        endDate: farFuture,
        priceSnapshot: proVariant.price,
        maxDurationPerFileSnapshot: proVariant.maxDurationPerFile,
        monthlyQuotaSecondsSnapshot: proVariant.monthlyQuotaSeconds,
      },
    });
  } else {
    await prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.create({
        data: {
          userId: existing.id,
          variantId: proVariant.id,
          startDate: new Date(),
          endDate: farFuture,
          status: 'ACTIVE',
          priceSnapshot: proVariant.price,
          maxDurationPerFileSnapshot: proVariant.maxDurationPerFile,
          monthlyQuotaSecondsSnapshot: proVariant.monthlyQuotaSeconds,
        },
        select: { id: true },
      });

      await tx.user.update({
        where: { id: existing.id },
        data: { currentSubscriptionId: subscription.id },
      });
    });
  }

  console.log(`Updated test user ${TEST_EMAIL}`);
}

async function requestJson<T>(
  pathOrUrl: string,
  init?: RequestInit,
): Promise<T> {
  const url = pathOrUrl.startsWith('http')
    ? pathOrUrl
    : `${BASE_URL}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`;

  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `${response.status} ${response.statusText} for ${url}\n${body}`,
    );
  }

  return (await response.json()) as T;
}

async function login(): Promise<LoginResponse> {
  return requestJson<LoginResponse>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
}

async function submitYoutube(
  accessToken: string,
): Promise<SubmitYoutubeResponse> {
  return requestJson<SubmitYoutubeResponse>('/media/youtube', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ url: TEST_YOUTUBE_URL }),
  });
}

async function pollForCompletion(
  mediaId: string,
  accessToken: string,
): Promise<MediaStatusResponse> {
  const startedAt = Date.now();
  const statusUrl = `${BASE_URL}/media/${mediaId}/status`;

  while (Date.now() - startedAt < TIMEOUT_MS) {
    const response = await fetch(statusUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.status === 429) {
      console.log(
        `status=poll-throttled | waiting=${THROTTLE_BACKOFF_MS / 1000}s`,
      );
      await new Promise((resolve) => setTimeout(resolve, THROTTLE_BACKOFF_MS));
      continue;
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `${response.status} ${response.statusText} for ${statusUrl}\n${body}`,
      );
    }

    const status = (await response.json()) as MediaStatusResponse;

    console.log(
      [
        `status=${status.status}`,
        `progress=${(status.progress * 100).toFixed(1)}%`,
        `step=${status.currentStep ?? '-'}`,
        `eta=${status.estimatedTimeRemaining ?? '-'}s`,
      ].join(' | '),
    );

    if (status.status === 'COMPLETED') {
      return status;
    }

    if (status.status === 'FAILED') {
      throw new Error(
        `Media processing failed: ${status.failReason ?? 'Unknown error'}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(
    `Timed out after ${TIMEOUT_MS / 1000}s waiting for media ${mediaId}`,
  );
}

async function printArtifacts(
  mediaId: string,
  accessToken: string,
): Promise<void> {
  const artifacts = await requestJson<MediaArtifactsResponse>(
    `/media/${mediaId}/artifacts`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  console.log('Artifacts summary:', JSON.stringify(artifacts.summary, null, 2));

  if (!artifacts.final) {
    console.log('Final artifact is not available yet.');
    return;
  }

  const finalArtifact = await requestJson<FinalArtifact>(artifacts.final.url);
  const avgSentenceLength =
    finalArtifact.segments.length === 0
      ? 0
      : finalArtifact.segments.reduce(
          (sum, segment) =>
            sum + segment.text.trim().split(/\s+/).filter(Boolean).length,
          0,
        ) / finalArtifact.segments.length;

  console.log(
    'Final artifact metadata:',
    JSON.stringify(finalArtifact.metadata, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        sentenceCount: finalArtifact.segments.length,
        avgSentenceLengthWords: Number(avgSentenceLength.toFixed(2)),
        firstSegment: finalArtifact.segments[0] ?? null,
      },
      null,
      2,
    ),
  );
}

async function main(): Promise<void> {
  console.log('YouTube E2E baseline');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`YouTube URL: ${TEST_YOUTUBE_URL}`);

  const overallStartedAt = Date.now();

  await ensureTestUser();
  const auth = await login();
  console.log(`Authenticated as ${auth.user.email}`);

  const submitted = await submitYoutube(auth.tokens.accessToken);
  console.log(
    JSON.stringify(
      {
        mediaId: submitted.id,
        jobId: submitted.jobId,
        title: submitted.title,
        status: submitted.status,
      },
      null,
      2,
    ),
  );

  const completedStatus = await pollForCompletion(
    submitted.id,
    auth.tokens.accessToken,
  );
  console.log('Completed status:', JSON.stringify(completedStatus, null, 2));

  await printArtifacts(submitted.id, auth.tokens.accessToken);

  console.log(
    `Total processing time: ${((Date.now() - overallStartedAt) / 1000).toFixed(1)}s`,
  );
}

void main()
  .catch((error) => {
    console.error('test:youtube failed');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
