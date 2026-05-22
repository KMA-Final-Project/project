import 'dotenv/config';

import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from 'prisma/generated/client';
import { BillingCycleType } from 'prisma/generated/enums';
import { Client as MinioClient } from 'minio';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repoRoot = resolve(__dirname, '..', '..', '..');
const defaultOutputRoot = resolve(repoRoot, 'outputs', 'e2e-youtube-eval');
const testMediaMarkdownPath = resolve(repoRoot, 'apps', 'ai-engine', 'test_medias.md');

const TEST_EMAIL = 'sondoannam202@gmail.com';
const TEST_PASSWORD = 'Test@123';
const TEST_FULL_NAME = 'Bilingual Test User';
const DEFAULT_CASE_IDS = ['english_-moW9jvvMr4', 'chinese_kUzay3X1maA'];
const DEFAULT_POLL_INTERVAL_MS = 10_000;
const DEFAULT_THROTTLE_BACKOFF_MS = 20_000;
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1_000;
const DEFAULT_TARGET_LANGUAGE = 'vi';
const API_PREFIX = (process.env.API_PREFIX ?? 'api').replace(/^\/+|\/+$/g, '');
const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);
const BASE_URL = `http://localhost:${PORT}/${API_PREFIX}`;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required to run the E2E YouTube evaluator.');
}

type UserProfile = {
  id: string;
  email: string;
  fullName: string;
  emailVerified: boolean;
};

type LoginResponse = {
  user: UserProfile;
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
  chunks: Array<{
    chunkIndex: number;
    objectKey: string;
    url: string;
    size: number;
    lastModified: string | null;
  }>;
  translatedBatches: Array<{
    batchIndex: number;
    objectKey: string;
    url: string;
    size: number;
    lastModified: string | null;
  }>;
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
    phonetic?: string;
    start: number;
    end: number;
    words?: Array<{
      word: string;
      start: number;
      end: number;
      phoneme?: string | null;
    }>;
  }>;
};

type TranslatedBatchArtifact = {
  batch_index: number;
  first_segment_index: number;
  segments: FinalArtifact['segments'];
};

type TimelineEntry = {
  tSeconds: number;
  at: string;
  status: string;
  progress: number;
  currentStep: string | null;
  estimatedTimeRemaining: number | null;
  sourceLanguage: string | null;
  artifacts: MediaStatusResponse['artifacts'] | null;
};

type CaseDefinition = {
  caseId: string;
  family: string;
  url: string;
};

type CaseSummary = {
  caseId: string;
  family: string;
  url: string;
  mediaId: string;
  title: string;
  jobId: string;
  submittedStatus: string;
  completedStatus: string;
  elapsedSeconds: number;
  sourceLanguageFromStatus: string | null;
  finalMetadata: FinalArtifact['metadata'] | null;
  artifactSummary: MediaArtifactsResponse['summary'];
  heuristic: ReturnType<typeof evaluateArtifactHeuristics> | null;
  samples: {
    firstSegments: FinalArtifact['segments'];
    firstTranslatedBatchSegments: FinalArtifact['segments'] | null;
  };
  timeline: TimelineEntry[];
};

type Options = {
  caseIds: string[];
  outputDir: string;
  targetLanguage: string;
  pollIntervalMs: number;
  throttleBackoffMs: number;
  timeoutMs: number;
};

const pool = new PrismaPg({ connectionString: DATABASE_URL });
const prisma = new PrismaClient({ adapter: pool });
const minio = new MinioClient({
  endPoint: process.env.MINIO_ENDPOINT ?? 'localhost',
  port: Number.parseInt(process.env.MINIO_PORT ?? '9000', 10),
  accessKey: process.env.MINIO_ACCESS_KEY ?? '',
  secretKey: process.env.MINIO_SECRET_KEY ?? '',
  useSSL: String(process.env.MINIO_USE_SSL ?? 'false').toLowerCase() === 'true',
});
const processedBucket = process.env.MINIO_BUCKET_PROCESSED ?? 'processed';

function parseArgs(argv: string[]): Options {
  const options: Options = {
    caseIds: [...DEFAULT_CASE_IDS],
    outputDir: join(defaultOutputRoot, timestampForPath(new Date())),
    targetLanguage: DEFAULT_TARGET_LANGUAGE,
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
    throttleBackoffMs: DEFAULT_THROTTLE_BACKOFF_MS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  const explicitCaseIds: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    switch (current) {
      case '--case-id': {
        const value = argv[index + 1];
        if (!value) throw new Error('Missing value for --case-id');
        explicitCaseIds.push(value.trim());
        index += 1;
        break;
      }
      case '--output-dir': {
        const value = argv[index + 1];
        if (!value) throw new Error('Missing value for --output-dir');
        options.outputDir = resolve(value);
        index += 1;
        break;
      }
      case '--target-language': {
        const value = argv[index + 1];
        if (!value) throw new Error('Missing value for --target-language');
        options.targetLanguage = value.trim();
        index += 1;
        break;
      }
      case '--poll-ms': {
        const value = Number.parseInt(argv[index + 1] ?? '', 10);
        if (!Number.isInteger(value) || value <= 0) {
          throw new Error('Invalid value for --poll-ms');
        }
        options.pollIntervalMs = value;
        index += 1;
        break;
      }
      case '--timeout-ms': {
        const value = Number.parseInt(argv[index + 1] ?? '', 10);
        if (!Number.isInteger(value) || value <= 0) {
          throw new Error('Invalid value for --timeout-ms');
        }
        options.timeoutMs = value;
        index += 1;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${current}`);
    }
  }

  if (explicitCaseIds.length > 0) {
    options.caseIds = explicitCaseIds;
  }

  return options;
}

function timestampForPath(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function loadCaseDefinitions(): Map<string, CaseDefinition> {
  const markdown = readFileSync(testMediaMarkdownPath, 'utf8');
  const cases = new Map<string, CaseDefinition>();
  let currentFamily = '';

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      currentFamily = line.replace(/^#+\s*/, '').trim().toLowerCase();
      continue;
    }
    if (!line.startsWith('- ') || !currentFamily) continue;
    let url = line.slice(2).trim();
    if (
      (url.startsWith('"') && url.endsWith('"')) ||
      (url.startsWith("'") && url.endsWith("'"))
    ) {
      url = url.slice(1, -1);
    }
    const videoId = extractYoutubeVideoId(url);
    const caseId = `${currentFamily}_${videoId}`;
    cases.set(caseId, { caseId, family: currentFamily, url });
  }

  return cases;
}

function extractYoutubeVideoId(url: string): string {
  const parsed = new URL(url);
  const videoId = parsed.searchParams.get('v');
  if (videoId) return videoId;
  const fallback = parsed.pathname.split('/').filter(Boolean).pop();
  if (fallback) return fallback;
  throw new Error(`Could not determine YouTube video id from URL: ${url}`);
}

async function ensureTestUser(): Promise<void> {
  const existing = await prisma.user.findUnique({
    where: { email: TEST_EMAIL },
    select: { id: true, currentSubscriptionId: true },
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
    throw new Error('Active PRO_MONTHLY variant not found. Seed the database first.');
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
    return;
  }

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
    throw new Error(`${response.status} ${response.statusText} for ${url}\n${body}`);
  }
  return (await response.json()) as T;
}

async function login(): Promise<LoginResponse> {
  return requestJson<LoginResponse>('/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-device-info': 'e2e-youtube-pipeline-eval',
    },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
}

async function submitYoutube(
  accessToken: string,
  url: string,
  targetLanguage: string,
  title: string,
): Promise<SubmitYoutubeResponse> {
  return requestJson<SubmitYoutubeResponse>('/media/youtube', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'x-device-info': 'e2e-youtube-pipeline-eval',
    },
    body: JSON.stringify({ url, targetLanguage, title }),
  });
}

async function pollForCompletion(
  mediaId: string,
  accessToken: string,
  options: Options,
): Promise<{ status: MediaStatusResponse; timeline: TimelineEntry[]; elapsedSeconds: number }> {
  const startedAt = Date.now();
  const timeline: TimelineEntry[] = [];
  const statusUrl = `${BASE_URL}/media/${mediaId}/status`;

  while (Date.now() - startedAt < options.timeoutMs) {
    const response = await fetch(statusUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.status === 429) {
      await wait(options.throttleBackoffMs);
      continue;
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`${response.status} ${response.statusText} for ${statusUrl}\n${body}`);
    }

    const status = (await response.json()) as MediaStatusResponse;
    timeline.push({
      tSeconds: round((Date.now() - startedAt) / 1000, 3),
      at: new Date().toISOString(),
      status: status.status,
      progress: status.progress,
      currentStep: status.currentStep,
      estimatedTimeRemaining: status.estimatedTimeRemaining,
      sourceLanguage: status.sourceLanguage,
      artifacts: status.artifacts ?? null,
    });

    if (status.status === 'COMPLETED') {
      return {
        status,
        timeline,
        elapsedSeconds: round((Date.now() - startedAt) / 1000, 3),
      };
    }

    if (status.status === 'FAILED') {
      throw new Error(`Media processing failed: ${status.failReason ?? 'Unknown error'}`);
    }

    await wait(options.pollIntervalMs);
  }

  throw new Error(`Timed out after ${options.timeoutMs / 1000}s waiting for media ${mediaId}`);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readMinioJson<T>(objectKey: string): Promise<T> {
  const stream = await minio.getObject(processedBucket, objectKey);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
}

function round(value: number, digits = 3): number {
  return Number(value.toFixed(digits));
}

function evaluateArtifactHeuristics(finalArtifact: FinalArtifact, family: string) {
  const allSourceText = finalArtifact.segments.map((segment) => segment.text).join('\n');
  const allTranslationText = finalArtifact.segments
    .map((segment) => segment.translation)
    .join('\n');
  const emojiRegex = /[\p{Extended_Pictographic}\u2600-\u27BF]/gu;
  const controlTokenRegex = /<\|[^|]+\|>/gu;
  const hanRegex = /\p{Script=Han}/gu;
  const latinRegex = /[A-Za-z]/g;

  const emojiSourceCount = (allSourceText.match(emojiRegex) ?? []).length;
  const emojiTranslationCount = (allTranslationText.match(emojiRegex) ?? []).length;
  const controlTokenCount =
    (allSourceText.match(controlTokenRegex) ?? []).length +
    (allTranslationText.match(controlTokenRegex) ?? []).length;
  const hanCount = (allSourceText.match(hanRegex) ?? []).length;
  const latinCount = (allSourceText.match(latinRegex) ?? []).length;
  const segmentsWithLatin = finalArtifact.segments.filter((segment) =>
    /[A-Za-z]/.test(segment.text),
  ).length;
  const emptyTranslationCount = finalArtifact.segments.filter(
    (segment) => !segment.translation.trim(),
  ).length;
  const avgSourceLength =
    finalArtifact.segments.length === 0
      ? 0
      : round(
          finalArtifact.segments.reduce((sum, segment) => sum + segment.text.length, 0) /
            finalArtifact.segments.length,
          2,
        );

  const suspiciousFlags: string[] = [];
  const sourceLang = finalArtifact.metadata.source_lang.toLowerCase();
  const modelUsed = finalArtifact.metadata.model_used.toLowerCase();

  if (family === 'chinese' && sourceLang === 'en') {
    suspiciousFlags.push('expected_chinese_but_detected_english');
  }
  if (family === 'chinese' && modelUsed.includes('distil')) {
    suspiciousFlags.push('chinese_case_used_distil_model');
  }
  if (emojiSourceCount > 0 || emojiTranslationCount > 0) {
    suspiciousFlags.push('emoji_pollution_present');
  }
  if (controlTokenCount > 0) {
    suspiciousFlags.push('control_tokens_present');
  }
  if (family === 'chinese' && hanCount === 0) {
    suspiciousFlags.push('no_han_script_in_source_text');
  }

  return {
    segmentCount: finalArtifact.segments.length,
    emptyTranslationCount,
    avgSourceLength,
    emojiSourceCount,
    emojiTranslationCount,
    controlTokenCount,
    hanCount,
    latinCount,
    segmentsWithLatin,
    suspiciousFlags,
  };
}

function buildMarkdownSummary(
  suite: {
    startedAt: string;
    finishedAt: string;
    baseUrl: string;
    targetLanguage: string;
    cases: CaseSummary[];
  },
): string {
  const lines: string[] = [
    '# E2E YouTube Pipeline Evaluation',
    '',
    `- Started: ${suite.startedAt}`,
    `- Finished: ${suite.finishedAt}`,
    `- Base URL: ${suite.baseUrl}`,
    `- Target language: ${suite.targetLanguage}`,
    '',
    '| Case | Family | Final Status | Source | Model | Segments | Emoji(src/tr) | Flags |',
    '| --- | --- | --- | --- | --- | ---: | ---: | --- |',
  ];

  for (const caseSummary of suite.cases) {
    const metadata = caseSummary.finalMetadata;
    const heuristic = caseSummary.heuristic;
    lines.push(
      `| ${caseSummary.caseId} | ${caseSummary.family} | ${caseSummary.completedStatus} | ${metadata?.source_lang ?? '-'} | ${metadata?.model_used ?? '-'} | ${heuristic?.segmentCount ?? 0} | ${heuristic ? `${heuristic.emojiSourceCount}/${heuristic.emojiTranslationCount}` : '-'} | ${(heuristic?.suspiciousFlags ?? []).join(', ') || '-'} |`,
    );
    lines.push('');
    lines.push(`## ${caseSummary.caseId}`);
    lines.push('');
    lines.push(`- URL: ${caseSummary.url}`);
    lines.push(`- Media ID: ${caseSummary.mediaId}`);
    lines.push(`- Job ID: ${caseSummary.jobId}`);
    lines.push(`- Elapsed: ${caseSummary.elapsedSeconds}s`);
    lines.push(`- Source language (status): ${caseSummary.sourceLanguageFromStatus ?? '-'}`);
    lines.push(`- Final metadata: ${JSON.stringify(caseSummary.finalMetadata)}`);
    lines.push(`- Artifact summary: ${JSON.stringify(caseSummary.artifactSummary)}`);
    lines.push(`- Heuristic: ${JSON.stringify(caseSummary.heuristic)}`);
    lines.push('- First segments:');
    for (const segment of caseSummary.samples.firstSegments) {
      lines.push(`  - ${segment.start}-${segment.end}: ${segment.text} -> ${segment.translation}`);
    }
    if (caseSummary.samples.firstTranslatedBatchSegments) {
      lines.push('- First translated batch preview:');
      for (const segment of caseSummary.samples.firstTranslatedBatchSegments.slice(0, 3)) {
        lines.push(
          `  - ${segment.start}-${segment.end}: ${segment.text} -> ${segment.translation}`,
        );
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  ensureDir(options.outputDir);

  const caseMap = loadCaseDefinitions();
  const selectedCases = options.caseIds.map((caseId) => {
    const found = caseMap.get(caseId);
    if (!found) {
      throw new Error(`Unknown case id: ${caseId}`);
    }
    return found;
  });

  await ensureTestUser();
  const auth = await login();

  const suiteStartedAt = new Date();
  const suiteCases: CaseSummary[] = [];

  for (const caseDefinition of selectedCases) {
    const caseDir = join(options.outputDir, caseDefinition.caseId);
    ensureDir(caseDir);
    const submissionTitle = `[E2E] ${caseDefinition.caseId}`;

    console.log(`Submitting ${caseDefinition.caseId} -> ${caseDefinition.url}`);
    const submitted = await submitYoutube(
      auth.tokens.accessToken,
      caseDefinition.url,
      options.targetLanguage,
      submissionTitle,
    );

    const completion = await pollForCompletion(
      submitted.id,
      auth.tokens.accessToken,
      options,
    );
    const artifacts = await requestJson<MediaArtifactsResponse>(
      `/media/${submitted.id}/artifacts`,
      {
        headers: { Authorization: `Bearer ${auth.tokens.accessToken}` },
      },
    );

    writeFileSync(
      join(caseDir, 'status.timeline.json'),
      JSON.stringify(completion.timeline, null, 2),
      'utf8',
    );
    writeFileSync(
      join(caseDir, 'status.final.json'),
      JSON.stringify(completion.status, null, 2),
      'utf8',
    );
    writeFileSync(
      join(caseDir, 'artifacts.inventory.json'),
      JSON.stringify(artifacts, null, 2),
      'utf8',
    );

    let finalArtifact: FinalArtifact | null = null;
    let firstChunkArtifact: unknown = null;
    let firstTranslatedBatchArtifact: TranslatedBatchArtifact | null = null;

    if (artifacts.chunks[0]) {
      firstChunkArtifact = await readMinioJson<unknown>(artifacts.chunks[0].objectKey);
      writeFileSync(
        join(caseDir, 'chunk.first.json'),
        JSON.stringify(firstChunkArtifact, null, 2),
        'utf8',
      );
    }

    if (artifacts.translatedBatches[0]) {
      firstTranslatedBatchArtifact = await readMinioJson<TranslatedBatchArtifact>(
        artifacts.translatedBatches[0].objectKey,
      );
      writeFileSync(
        join(caseDir, 'translated_batch.first.json'),
        JSON.stringify(firstTranslatedBatchArtifact, null, 2),
        'utf8',
      );
    }

    if (artifacts.final?.objectKey) {
      finalArtifact = await readMinioJson<FinalArtifact>(artifacts.final.objectKey);
      writeFileSync(
        join(caseDir, 'final.json'),
        JSON.stringify(finalArtifact, null, 2),
        'utf8',
      );
    }

    const heuristic = finalArtifact
      ? evaluateArtifactHeuristics(finalArtifact, caseDefinition.family)
      : null;

    const caseSummary: CaseSummary = {
      caseId: caseDefinition.caseId,
      family: caseDefinition.family,
      url: caseDefinition.url,
      mediaId: submitted.id,
      title: submitted.title,
      jobId: submitted.jobId,
      submittedStatus: submitted.status,
      completedStatus: completion.status.status,
      elapsedSeconds: completion.elapsedSeconds,
      sourceLanguageFromStatus: completion.status.sourceLanguage,
      finalMetadata: finalArtifact?.metadata ?? null,
      artifactSummary: artifacts.summary,
      heuristic,
      samples: {
        firstSegments: finalArtifact?.segments.slice(0, 5) ?? [],
        firstTranslatedBatchSegments:
          firstTranslatedBatchArtifact?.segments.slice(0, 5) ?? null,
      },
      timeline: completion.timeline,
    };

    writeFileSync(
      join(caseDir, 'evaluation.summary.json'),
      JSON.stringify(caseSummary, null, 2),
      'utf8',
    );
    suiteCases.push(caseSummary);
  }

  const suiteFinishedAt = new Date();
  const suiteSummary = {
    startedAt: suiteStartedAt.toISOString(),
    finishedAt: suiteFinishedAt.toISOString(),
    baseUrl: BASE_URL,
    targetLanguage: options.targetLanguage,
    cases: suiteCases,
  };

  writeFileSync(
    join(options.outputDir, 'suite.summary.json'),
    JSON.stringify(suiteSummary, null, 2),
    'utf8',
  );
  writeFileSync(
    join(options.outputDir, 'suite.summary.md'),
    buildMarkdownSummary(suiteSummary),
    'utf8',
  );

  console.log(`E2E evaluation bundle written to ${options.outputDir}`);
}

void main()
  .catch((error) => {
    console.error('e2e-youtube-pipeline-eval failed');
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
