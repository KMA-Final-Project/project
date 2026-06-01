import 'dotenv/config';

import { copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { ensureBenchmarkUser, benchmarkCredentials } from './e2e-youtube-benchmark/auth';
import { loadCaseDefinitions, resolveSelectedCases } from './e2e-youtube-benchmark/fixtures';
import { createApiClient, fetchJsonFromUrl } from './e2e-youtube-benchmark/http';
import {
  buildSuiteSummary,
  evaluateArtifactHeuristics,
  renderSuiteMarkdown,
} from './e2e-youtube-benchmark/reporting';
import { createSubtitleClient } from './e2e-youtube-benchmark/subtitles';
import { createTokenizer, dedupeCueTokens } from './e2e-youtube-benchmark/tokenizer';
import type {
  BenchmarkOptions,
  CaseDefinition,
  CasePaths,
  CaseSummary,
  FinalArtifact,
  MediaArtifactsResponse,
  MilestoneTimings,
  StatusTimelineEntry,
  SuiteSummary,
  TranslatedBatchArtifact,
} from './e2e-youtube-benchmark/types';
import { ensureDir, processingRatioDisplay, timestampForPath, writeJsonFile, writeTextFile } from './e2e-youtube-benchmark/utils';
import { computeWer } from './e2e-youtube-benchmark/wer';

const repoRoot = resolve(__dirname, '..', '..', '..');
const benchmarkRoot = resolve(repoRoot, 'outputs', 'e2e-benchmarks');
const runsRoot = resolve(benchmarkRoot, 'runs');
const defaultOutputRoot = resolve(runsRoot, timestampForPath(new Date()));
const summaryJsonPath = resolve(benchmarkRoot, 'e2e_wer_suite_summary.json');
const summaryMarkdownPath = resolve(benchmarkRoot, 'e2e_wer_suite_summary.md');
const testMediaMarkdownPath = resolve(
  repoRoot,
  'apps',
  'ai-engine',
  'test_medias.md',
);
const aiEnginePythonPath = resolve(
  repoRoot,
  'apps',
  'ai-engine',
  'venv',
  'Scripts',
  'python.exe',
);
const aiEngineWorkingDirectory = resolve(repoRoot, 'apps', 'ai-engine');

const DEFAULT_POLL_INTERVAL_MS = 3_000;
const DEFAULT_THROTTLE_BACKOFF_MS = 20_000;
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1_000;
const DEFAULT_TARGET_LANGUAGE = 'vi';
const API_PREFIX = (process.env.API_PREFIX ?? 'api').replace(/^\/+|\/+$/g, '');
const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);
const DEFAULT_BASE_URL = `http://localhost:${PORT}/${API_PREFIX}`;
const DATABASE_URL = process.env.DATABASE_URL ?? null;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required to run the E2E YouTube evaluator.');
}
const VERIFIED_DATABASE_URL: string = DATABASE_URL;

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  ensureDir(options.outputDir);

  const allCases = loadCaseDefinitions(testMediaMarkdownPath);
  const selectedCases = resolveSelectedCases(allCases, options);
  const subtitleClient = createSubtitleClient();
  const tokenizer = createTokenizer({
    aiEnginePythonPath,
    aiEngineWorkingDirectory,
  });
  const api = createApiClient(options.baseUrl);

  await ensureBenchmarkUser(VERIFIED_DATABASE_URL);
  const { email, password } = benchmarkCredentials();

  const suiteStartedAt = new Date().toISOString();
  const caseSummaries: CaseSummary[] = [];

  for (const caseDefinition of selectedCases) {
    console.log(`Submitting ${caseDefinition.caseId} -> ${caseDefinition.url}`);
    const auth = await api.login(email, password);
    const caseSummary = await runCase({
      api,
      authToken: auth.tokens.accessToken,
      caseDefinition,
      options,
      subtitleClient,
      tokenizer,
    });
    caseSummaries.push(caseSummary);
  }

  const suiteFinishedAt = new Date().toISOString();
  const summary = buildSuiteSummary({
    startedAt: suiteStartedAt,
    finishedAt: suiteFinishedAt,
    baseUrl: options.baseUrl,
    targetLanguage: options.targetLanguage,
    runDirectory: options.outputDir,
    summaryJsonPath,
    summaryMarkdownPath,
    cases: caseSummaries,
  });

  persistSuiteSummary(summary, options.outputDir);
  console.log(`E2E WER suite written to ${options.outputDir}`);
}

async function runCase(input: {
  api: ReturnType<typeof createApiClient>;
  authToken: string;
  caseDefinition: CaseDefinition;
  options: BenchmarkOptions;
  subtitleClient: ReturnType<typeof createSubtitleClient>;
  tokenizer: ReturnType<typeof createTokenizer>;
}): Promise<CaseSummary> {
  const { caseDefinition, options, subtitleClient, tokenizer } = input;
  const paths = resolveCasePaths(options.outputDir, caseDefinition.caseId);
  ensureDir(paths.caseDir);

  const subtitleReference = await subtitleClient.downloadManualSubtitle(
    caseDefinition.url,
    caseDefinition.sourceLanguage,
    paths.caseDir,
  );

  const referenceCueTokens = subtitleReference
    ? await Promise.all(
        subtitleReference.cueTexts.map((cue) =>
          tokenizer.tokenize(caseDefinition.sourceLanguage, cue),
        ),
      )
    : [];
  const referenceTokens = subtitleReference
    ? dedupeCueTokens(referenceCueTokens, caseDefinition.sourceLanguage)
    : [];
  const normalizedReferenceText =
    referenceTokens.length > 0 ? referenceTokens.join(' ') : '';
  writeTextFile(paths.normalizedReferencePath, normalizedReferenceText);

  const submissionTitle = `[E2E WER] ${caseDefinition.caseId}`;
  const submitStartedAtMs = Date.now();
  const submission = await input.api.submitYoutube(input.authToken, {
    url: caseDefinition.url,
    sourceLanguage: caseDefinition.sourceLanguage,
    targetLanguage: options.targetLanguage,
    title: submissionTitle,
  });

  const completion = await input.api.pollForCompletion(
    input.authToken,
    submission.response.id,
    options,
    submitStartedAtMs,
  );
  const artifacts = await input.api.getArtifacts(
    input.authToken,
    submission.response.id,
  );

  const finalArtifact = await loadFinalArtifact(input.api.http, artifacts);
  const firstChunkArtifact = artifacts.chunks[0]
    ? await fetchJsonFromUrl<unknown>(artifacts.chunks[0].url, input.api.http)
    : null;
  const firstTranslatedBatchArtifact = artifacts.translatedBatches[0]
    ? await fetchJsonFromUrl<TranslatedBatchArtifact>(
        artifacts.translatedBatches[0].url,
        input.api.http,
      )
    : null;

  writeJsonFile(join(paths.caseDir, 'status.timeline.json'), completion.timeline);
  writeJsonFile(join(paths.caseDir, 'status.final.json'), completion.status);
  writeJsonFile(join(paths.caseDir, 'artifacts.inventory.json'), artifacts);
  if (firstChunkArtifact !== null) {
    writeJsonFile(join(paths.caseDir, 'chunk.first.json'), firstChunkArtifact);
  }
  if (firstTranslatedBatchArtifact !== null) {
    writeJsonFile(
      join(paths.caseDir, 'translated_batch.first.json'),
      firstTranslatedBatchArtifact,
    );
  }
  writeJsonFile(join(paths.caseDir, 'final.json'), finalArtifact);

  const hypothesisTokens = await tokenizeArtifactSourceText(
    tokenizer,
    caseDefinition.sourceLanguage,
    finalArtifact,
  );
  const normalizedHypothesisText = hypothesisTokens.join(' ');
  writeTextFile(paths.normalizedHypothesisPath, normalizedHypothesisText);

  const wer = referenceTokens.length > 0
    ? computeWer(referenceTokens, hypothesisTokens)
    : null;

  const durationSeconds =
    completion.status.durationSeconds ||
    Number(finalArtifact.metadata.duration) ||
    0;
  const processingToDurationRatio =
    durationSeconds > 0 ? completion.elapsedSeconds / durationSeconds : 0;

  const milestoneTimings = deriveMilestones(
    submission.submitRequestStartedAt,
    submission.submitResponseReceivedAt,
    submission.submitRoundTripMs,
    completion.timeline,
    completion.elapsedSeconds,
  );

  const summary: CaseSummary = {
    caseId: caseDefinition.caseId,
    family: caseDefinition.family,
    sourceLanguageRequested: caseDefinition.sourceLanguage,
    url: caseDefinition.url,
    mediaId: submission.response.id,
    title: submission.response.title,
    jobId: submission.response.jobId,
    submittedStatus: submission.response.status,
    completedStatus: completion.status.status,
    outputDir: paths.caseDir,
    durationSeconds,
    wallClockLatencySeconds: completion.elapsedSeconds,
    processingToDurationRatio,
    processingToDurationRatioDisplay:
      processingRatioDisplay(processingToDurationRatio) ?? '1:0',
    throughputMultiplier:
      completion.elapsedSeconds > 0 ? durationSeconds / completion.elapsedSeconds : 0,
    milestoneTimings,
    statusTimeline: completion.timeline,
    sourceLanguageFromStatus: completion.status.sourceLanguage,
    sourceLanguageFromFinalArtifact: finalArtifact.metadata.source_lang ?? null,
    targetLanguageRequested: options.targetLanguage,
    targetLanguageFromStatus: completion.status.targetLanguage,
    targetLanguageFromFinalArtifact: finalArtifact.metadata.target_lang ?? null,
    finalMetadata: finalArtifact.metadata,
    artifactSummary: artifacts.summary,
    subtitleReference: {
      manualSubtitlesAvailable:
        subtitleReference?.availableManualTags.length !== 0,
      automaticCaptionsAvailable:
        subtitleReference?.availableAutomaticTags.length !== 0,
      selectedLanguageTag: subtitleReference?.languageTag ?? null,
      subtitleFormat: subtitleReference?.format ?? null,
      subtitleAcquisitionSeconds: subtitleReference?.acquisitionSeconds ?? null,
      werEligible: wer !== null,
      werSkipReason: wer === null ? 'manual_subtitles_unavailable' : null,
      availableManualTags: subtitleReference?.availableManualTags ?? [],
      availableAutomaticTags: subtitleReference?.availableAutomaticTags ?? [],
    },
    tokens: {
      reference: wer?.referenceTokenCount ?? null,
      hypothesis: hypothesisTokens.length,
    },
    wer,
    heuristic: evaluateArtifactHeuristics(finalArtifact, caseDefinition.family),
    artifacts: {
      finalUrl: artifacts.final?.url ?? null,
      firstChunkUrl: artifacts.chunks[0]?.url ?? null,
      firstTranslatedBatchUrl: artifacts.translatedBatches[0]?.url ?? null,
    },
    samples: {
      firstSegments: finalArtifact.segments.slice(0, 5),
      firstTranslatedBatchSegments:
        firstTranslatedBatchArtifact?.segments.slice(0, 5) ?? null,
    },
  };

  writeJsonFile(paths.evaluationSummaryPath, summary);
  return summary;
}

async function loadFinalArtifact(
  http: ReturnType<typeof createApiClient>['http'],
  artifacts: MediaArtifactsResponse,
): Promise<FinalArtifact> {
  if (!artifacts.final?.url) {
    throw new Error(
      `Completed media ${artifacts.mediaId} did not expose a final artifact URL`,
    );
  }
  return fetchJsonFromUrl<FinalArtifact>(artifacts.final.url, http);
}

async function tokenizeArtifactSourceText(
  tokenizer: ReturnType<typeof createTokenizer>,
  sourceLanguage: CaseDefinition['sourceLanguage'],
  artifact: FinalArtifact,
): Promise<string[]> {
  const tokenLists = await Promise.all(
    artifact.segments.map((segment) =>
      tokenizer.tokenize(sourceLanguage, segment.text),
    ),
  );
  return tokenLists.flat();
}

function deriveMilestones(
  submitRequestStartedAt: string,
  submitResponseReceivedAt: string,
  submitRoundTripMs: number,
  timeline: StatusTimelineEntry[],
  elapsedSeconds: number,
): MilestoneTimings {
  const validating = timeline.find((entry) => entry.status === 'VALIDATING');
  const processing = timeline.find((entry) => entry.status === 'PROCESSING');
  const firstChunk = timeline.find((entry) => entry.artifacts.chunkCount > 0);
  const firstBatch = timeline.find(
    (entry) => entry.artifacts.translatedBatchCount > 0,
  );
  const hasFinal = timeline.find((entry) => entry.artifacts.hasFinal);

  return {
    submitRequestStartedAt,
    submitResponseReceivedAt,
    submitRoundTripMs,
    timeToValidatingSeconds: validating?.tSeconds ?? null,
    timeToProcessingSeconds: processing?.tSeconds ?? null,
    timeToFirstChunkSeconds: firstChunk?.tSeconds ?? null,
    timeToFirstTranslatedBatchSeconds: firstBatch?.tSeconds ?? null,
    timeToHasFinalSeconds: hasFinal?.tSeconds ?? null,
    timeToCompletedSeconds: elapsedSeconds,
  };
}

function resolveCasePaths(runDirectory: string, caseId: string): CasePaths {
  const caseDir = join(runDirectory, caseId);
  return {
    caseDir,
    normalizedReferencePath: join(caseDir, 'ground_truth.normalized.txt'),
    normalizedHypothesisPath: join(caseDir, 'hypothesis.normalized.txt'),
    evaluationSummaryPath: join(caseDir, 'evaluation.summary.json'),
  };
}

function persistSuiteSummary(summary: SuiteSummary, runDirectory: string): void {
  const runSummaryJsonPath = join(runDirectory, 'suite.summary.json');
  const runSummaryMarkdownPath = join(runDirectory, 'suite.summary.md');
  const markdown = renderSuiteMarkdown(summary);

  writeJsonFile(runSummaryJsonPath, summary);
  writeTextFile(runSummaryMarkdownPath, markdown);
  writeJsonFile(summary.summaryJsonPath, summary);
  writeTextFile(summary.summaryMarkdownPath, markdown);

  const summaryCopyDir = join(runDirectory, 'summary');
  ensureDir(summaryCopyDir);
  copyFileSync(summary.summaryJsonPath, join(summaryCopyDir, 'e2e_wer_suite_summary.json'));
  copyFileSync(
    summary.summaryMarkdownPath,
    join(summaryCopyDir, 'e2e_wer_suite_summary.md'),
  );
}

function parseArgs(argv: string[]): BenchmarkOptions {
  const explicitCaseIds: string[] = [];
  const options: BenchmarkOptions = {
    baseUrl: DEFAULT_BASE_URL,
    caseIds: explicitCaseIds,
    outputDir: defaultOutputRoot,
    targetLanguage: DEFAULT_TARGET_LANGUAGE,
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
    throttleBackoffMs: DEFAULT_THROTTLE_BACKOFF_MS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    switch (current) {
      case '--base-url': {
        const value = argv[index + 1];
        if (!value) {
          throw new Error('Missing value for --base-url');
        }
        options.baseUrl = value.trim().replace(/\/+$/, '');
        index += 1;
        break;
      }
      case '--case-id': {
        const value = argv[index + 1];
        if (!value) {
          throw new Error('Missing value for --case-id');
        }
        explicitCaseIds.push(value.trim());
        index += 1;
        break;
      }
      case '--output-dir': {
        const value = argv[index + 1];
        if (!value) {
          throw new Error('Missing value for --output-dir');
        }
        options.outputDir = resolve(value);
        index += 1;
        break;
      }
      case '--target-language': {
        const value = argv[index + 1];
        if (!value) {
          throw new Error('Missing value for --target-language');
        }
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

  return options;
}

void main().catch((error) => {
  console.error('e2e-youtube-pipeline-eval failed');
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
