import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import type {
  CaseSummary,
  FinalArtifact,
  MediaArtifactSummary,
  StatusTimelineEntry,
  SuiteSummary,
  TranslatedBatchArtifact,
} from './types';
import { computeWer } from './wer';
import { average, ensureDir, round, writeJsonFile, writeTextFile } from './utils';

const DEFAULT_MANUAL_REVIEW_LIMIT = 5;
const TOO_SHORT_SEGMENT_SECONDS = 0.5;
const TOO_LONG_SEGMENT_SECONDS = 12;

type Nullable<T> = T | null;

type CerBreakdown = {
  substitutions: number;
  deletions: number;
  insertions: number;
  referenceCharCount: number;
  hypothesisCharCount: number;
  cer: number;
};

type Chapter3CaseRow = {
  case_id: string;
  source_language: string | null;
  language_family: string | null;
  target_language: string | null;
  source_type: string;
  media_url: string | null;
  duration_seconds: number | null;
  manual_subtitle_available: boolean;
  status: string;
  fail_reason: string | null;
};

type Chapter3PerformanceRow = {
  case_id: string;
  duration_seconds: number | null;
  wall_clock_latency_seconds: number | null;
  processing_to_duration_ratio: number | null;
  throughput_multiplier: number | null;
  submit_round_trip_ms: number | null;
  time_to_validating_seconds: number | null;
  time_to_processing_seconds: number | null;
  time_to_first_chunk_seconds: number | null;
  time_to_first_translated_batch_seconds: number | null;
  time_to_has_final_seconds: number | null;
  time_to_completed_seconds: number | null;
};

type Chapter3PolicyRow = {
  case_id: string;
  media_id: string | null;
  source_language: string | null;
  requested_translation_start_policy: string | null;
  effective_translation_start_policy: string | null;
  auto_policy_downgraded: boolean | null;
  route: string | null;
  asr_provider: string | null;
  trust_gate_active: boolean | null;
  trust_stage: string | null;
  trust_decision: string | null;
  policy_metadata_source: 'ai_engine_log' | 'not_available';
};

type Chapter3ArtifactRow = {
  case_id: string;
  chunk_count: number;
  translated_batch_count: number;
  has_final: boolean;
  final_segment_count: number;
  chunk_first_exists: boolean;
  translated_batch_first_exists: boolean;
  final_json_exists: boolean;
  progressive_artifacts_before_final: 'yes' | 'no' | 'not_available';
  segments_with_source_text: number;
  segments_with_translation: number;
  segments_with_phonetic: number;
  segments_with_words: number;
  empty_source_text_count: number;
  empty_translation_count: number;
  missing_phonetic_count: number;
  missing_segment_index_count: number;
  valid_timestamp_count: number;
  invalid_timestamp_count: number;
  negative_duration_count: number;
  overlapping_segment_count: number;
  non_monotonic_timestamp_count: number;
  average_segment_duration_seconds: number | null;
  too_short_segment_count: number;
  too_long_segment_count: number;
  schema_validation_status: string;
};

type Chapter3QualityRow = {
  case_id: string;
  wer_available: boolean;
  wer: number | null;
  substitutions: number | null;
  deletions: number | null;
  insertions: number | null;
  reference_token_count: number | null;
  hypothesis_token_count: number | null;
  cer_available: boolean;
  cer: number | null;
  reference_char_count: number | null;
  hypothesis_char_count: number | null;
  quality_note: string;
};

type Chapter3ManualReviewRow = {
  case_id: string;
  segment_index: number | null;
  start_seconds: number | null;
  end_seconds: number | null;
  source_text: string;
  system_translation: string;
  phonetic: string;
  meaning_preservation_score: string;
  fluency_score: string;
  terminology_name_preservation_score: string;
  no_missing_important_information_score: string;
  subtitle_readability_score: string;
  reviewer_comment: string;
};

type Chapter3Results = {
  generatedAt: string;
  exporterVersion: 1;
  run: {
    runDir: string;
    resultsDir: string;
    logsDir: string | null;
    manifestPath: string | null;
    command: string | null;
    commandSource: 'explicit' | 'manifest_inferred' | 'not_available';
    pollingIntervalMs: number | null;
  };
  suite: {
    summaryPath: string | null;
    fixtureCounts: SuiteSummary['fixtureCounts'] | null;
    aggregate: SuiteSummary['aggregate'] | null;
    familyAggregate: SuiteSummary['familyAggregate'] | null;
    baseUrl: string | null;
    targetLanguage: string | null;
    startedAt: string | null;
    finishedAt: string | null;
  };
  manualReviewSampleSize: number;
  cases: Chapter3CaseRow[];
  performanceMetrics: Chapter3PerformanceRow[];
  policyMetrics: Chapter3PolicyRow[];
  artifactMetrics: Chapter3ArtifactRow[];
  qualityMetrics: Chapter3QualityRow[];
  manualTranslationReview: Chapter3ManualReviewRow[];
  evidence: {
    filesByCase: Array<{
      caseId: string;
      evaluationSummaryPath: string | null;
      statusTimelinePath: string | null;
      chunkFirstPath: string | null;
      translatedBatchFirstPath: string | null;
      finalJsonPath: string | null;
      artifactsInventoryPath: string | null;
    }>;
    suggestedScreenshots: string[];
  };
  notes: string[];
};

type ExportChapter3Options = {
  runDir: string;
  outDir: string;
  manualReviewLimit?: number;
  command?: string | null;
};

type ExportChapter3OutputPaths = {
  resultsJsonPath: string;
  casesCsvPath: string;
  performanceCsvPath: string;
  policyCsvPath: string;
  artifactCsvPath: string;
  qualityCsvPath: string;
  manualReviewCsvPath: string;
  reportMarkdownPath: string;
  evidenceIndexPath: string;
};

type RunPaths = {
  runDir: string;
  resultsDir: string;
  summaryPath: string | null;
  manifestPath: string | null;
  logsDir: string | null;
};

type ParsedPolicyMetadata = {
  mediaId: string;
  sourceLanguage: string | null;
  requestedTranslationStartPolicy: string | null;
  effectiveTranslationStartPolicy: string | null;
  route: string | null;
  asrProvider: string | null;
  trustGateActive: boolean | null;
};

type CaseBundle = {
  caseId: string;
  caseDir: string;
  summary: CaseSummary | null;
  statusFinal: Record<string, unknown> | null;
  statusTimeline: StatusTimelineEntry[];
  artifactsInventory: Record<string, unknown> | null;
  finalArtifact: FinalArtifact | null;
  translatedBatchFirst: TranslatedBatchArtifact | null;
  chunkFirstExists: boolean;
  translatedBatchFirstExists: boolean;
  finalJsonExists: boolean;
  referenceText: string | null;
  hypothesisText: string | null;
  paths: {
    evaluationSummaryPath: string | null;
    statusFinalPath: string | null;
    statusTimelinePath: string | null;
    chunkFirstPath: string | null;
    translatedBatchFirstPath: string | null;
    finalJsonPath: string | null;
    artifactsInventoryPath: string | null;
  };
};

export function exportChapter3BenchmarkPackage(
  options: ExportChapter3Options,
): ExportChapter3OutputPaths {
  const outDir = resolve(options.outDir);
  ensureDir(outDir);

  const results = buildChapter3Results(options);

  const paths: ExportChapter3OutputPaths = {
    resultsJsonPath: join(outDir, 'chapter3_results.json'),
    casesCsvPath: join(outDir, 'chapter3_cases.csv'),
    performanceCsvPath: join(outDir, 'chapter3_performance_metrics.csv'),
    policyCsvPath: join(outDir, 'chapter3_policy_metrics.csv'),
    artifactCsvPath: join(outDir, 'chapter3_artifact_metrics.csv'),
    qualityCsvPath: join(outDir, 'chapter3_quality_metrics.csv'),
    manualReviewCsvPath: join(outDir, 'chapter3_manual_translation_review.csv'),
    reportMarkdownPath: join(outDir, 'chapter3_benchmark_report.md'),
    evidenceIndexPath: join(outDir, 'chapter3_evidence_index.md'),
  };

  writeJsonFile(paths.resultsJsonPath, results);
  writeTextFile(paths.casesCsvPath, buildCsv(results.cases));
  writeTextFile(paths.performanceCsvPath, buildCsv(results.performanceMetrics));
  writeTextFile(paths.policyCsvPath, buildCsv(results.policyMetrics));
  writeTextFile(paths.artifactCsvPath, buildCsv(results.artifactMetrics));
  writeTextFile(paths.qualityCsvPath, buildCsv(results.qualityMetrics));
  writeTextFile(paths.manualReviewCsvPath, buildCsv(results.manualTranslationReview));
  writeTextFile(paths.reportMarkdownPath, renderChapter3BenchmarkReport(results));
  writeTextFile(paths.evidenceIndexPath, renderChapter3EvidenceIndex(results));

  return paths;
}

export function buildChapter3Results(
  options: ExportChapter3Options,
): Chapter3Results {
  const runPaths = resolveRunPaths(options.runDir);
  const suiteSummary = runPaths.summaryPath
    ? readJsonFile<SuiteSummary>(runPaths.summaryPath)
    : null;
  const manifest = runPaths.manifestPath
    ? readJsonFile<Record<string, unknown>>(runPaths.manifestPath)
    : null;
  const manualReviewLimit = options.manualReviewLimit ?? DEFAULT_MANUAL_REVIEW_LIMIT;
  const caseBundles = loadCaseBundles(runPaths.resultsDir, suiteSummary);
  const policyMetadataByCase = loadPolicyMetadataByCase(runPaths.logsDir, caseBundles);

  const caseRows = caseBundles.map(buildCaseRow);
  const performanceRows = caseBundles.map(buildPerformanceRow);
  const policyRows = caseBundles.map((bundle) =>
    buildPolicyRow(bundle, policyMetadataByCase.get(bundle.caseId) ?? null),
  );
  const artifactRows = caseBundles.map(buildArtifactRow);
  const qualityRows = caseBundles.map(buildQualityRow);
  const manualReviewRows = caseBundles.flatMap((bundle) =>
    buildManualReviewRows(bundle, manualReviewLimit),
  );

  const commandResolution = resolveCommandString(
    options.command ?? null,
    manifest,
    runPaths.runDir,
  );

  return {
    generatedAt: new Date().toISOString(),
    exporterVersion: 1,
    run: {
      runDir: runPaths.runDir,
      resultsDir: runPaths.resultsDir,
      logsDir: runPaths.logsDir,
      manifestPath: runPaths.manifestPath,
      command: commandResolution.command,
      commandSource: commandResolution.source,
      pollingIntervalMs: resolvePollingIntervalMs(manifest),
    },
    suite: {
      summaryPath: runPaths.summaryPath,
      fixtureCounts: suiteSummary?.fixtureCounts ?? null,
      aggregate: suiteSummary?.aggregate ?? null,
      familyAggregate: suiteSummary?.familyAggregate ?? null,
      baseUrl: suiteSummary?.baseUrl ?? null,
      targetLanguage: suiteSummary?.targetLanguage ?? null,
      startedAt: suiteSummary?.startedAt ?? null,
      finishedAt: suiteSummary?.finishedAt ?? null,
    },
    manualReviewSampleSize: manualReviewLimit,
    cases: caseRows,
    performanceMetrics: performanceRows,
    policyMetrics: policyRows,
    artifactMetrics: artifactRows,
    qualityMetrics: qualityRows,
    manualTranslationReview: manualReviewRows,
    evidence: {
      filesByCase: caseBundles.map((bundle) => ({
        caseId: bundle.caseId,
        evaluationSummaryPath: bundle.paths.evaluationSummaryPath,
        statusTimelinePath: bundle.paths.statusTimelinePath,
        chunkFirstPath: bundle.paths.chunkFirstPath,
        translatedBatchFirstPath: bundle.paths.translatedBatchFirstPath,
        finalJsonPath: bundle.paths.finalJsonPath,
        artifactsInventoryPath: bundle.paths.artifactsInventoryPath,
      })),
      suggestedScreenshots: [
        'processing screen with progress and currentStep visible',
        'artifact inventory or MinIO browser showing chunks/, translated_batches/, final.json',
        'mobile player showing bilingual subtitles',
        'word lookup / explain popup if available',
      ],
    },
    notes: [
      'This exporter describes progressive asynchronous subtitle generation, not live simultaneous interpretation.',
      'Timing milestones are observed via backend status polling over saved evaluator timelines, not exact socket, Redis, MinIO, or client-perceived timestamps.',
      'Timing precision is limited by the polling interval used by the E2E harness for that run.',
      'progressive_artifacts_before_final is inferred from the earliest polling-observed chunk/batch visibility versus polling-observed final visibility.',
      'CER is computed from whitespace-insensitive character streams using saved normalized reference/hypothesis text when available.',
      policyRows.some((entry) => entry.policy_metadata_source === 'ai_engine_log')
        ? 'Per-case translation policy metadata is parsed from ai-engine.log route lines and remains optional, backward-compatible benchmark evidence only.'
        : 'Per-case translation policy metadata was not available in the saved run bundle, so policy interpretation still depends on readiness notes or ai-engine logs.',
      'Translation quality remains primarily a manual-review task unless stronger references or a wired judge are added later.',
    ],
  };
}

export function computeCer(
  referenceText: string | null | undefined,
  hypothesisText: string | null | undefined,
): CerBreakdown | null {
  const referenceChars = normalizeCerText(referenceText ?? '');
  const hypothesisChars = normalizeCerText(hypothesisText ?? '');

  if (referenceChars.length === 0) {
    return null;
  }

  const wer = computeWer(referenceChars, hypothesisChars);
  return {
    substitutions: wer.substitutions,
    deletions: wer.deletions,
    insertions: wer.insertions,
    referenceCharCount: wer.referenceTokenCount,
    hypothesisCharCount: wer.hypothesisTokenCount,
    cer: wer.finalWer,
  };
}

function normalizeCerText(text: string): string[] {
  return Array.from(text.normalize('NFC').replace(/\s+/g, ''));
}

function buildCaseRow(bundle: CaseBundle): Chapter3CaseRow {
  const sourceLanguage =
    bundle.summary?.sourceLanguageRequested ??
    getNullableString(bundle.statusFinal?.sourceLanguage) ??
    inferSourceLanguageFromCaseId(bundle.caseId);
  const targetLanguage =
    bundle.summary?.targetLanguageRequested ??
    bundle.summary?.targetLanguageFromStatus ??
    getNullableString(bundle.statusFinal?.targetLanguage);
  const status =
    bundle.summary?.completedStatus ??
    getNullableString(bundle.statusFinal?.status) ??
    'not_available';
  const failReason =
    getNullableString(bundle.statusFinal?.failReason) ??
    (status === 'FAILED' ? 'not_available' : null);

  return {
    case_id: bundle.caseId,
    source_language: sourceLanguage,
    language_family: bundle.summary?.family ?? inferFamilyFromCaseId(bundle.caseId),
    target_language: targetLanguage,
    source_type: inferSourceType(bundle.summary?.url ?? null),
    media_url: bundle.summary?.url ?? null,
    duration_seconds:
      bundle.summary?.durationSeconds ??
      getNullableNumber(bundle.statusFinal?.durationSeconds) ??
      bundle.finalArtifact?.metadata.duration ??
      null,
    manual_subtitle_available: inferManualSubtitleAvailable(bundle),
    status,
    fail_reason: failReason,
  };
}

function buildPerformanceRow(bundle: CaseBundle): Chapter3PerformanceRow {
  const timings = bundle.summary?.milestoneTimings;
  return {
    case_id: bundle.caseId,
    duration_seconds:
      bundle.summary?.durationSeconds ??
      getNullableNumber(bundle.statusFinal?.durationSeconds) ??
      bundle.finalArtifact?.metadata.duration ??
      null,
    wall_clock_latency_seconds: bundle.summary?.wallClockLatencySeconds ?? null,
    processing_to_duration_ratio: bundle.summary?.processingToDurationRatio ?? null,
    throughput_multiplier: bundle.summary?.throughputMultiplier ?? null,
    submit_round_trip_ms: timings?.submitRoundTripMs ?? null,
    time_to_validating_seconds: timings?.timeToValidatingSeconds ?? null,
    time_to_processing_seconds: timings?.timeToProcessingSeconds ?? null,
    time_to_first_chunk_seconds: timings?.timeToFirstChunkSeconds ?? null,
    time_to_first_translated_batch_seconds:
      timings?.timeToFirstTranslatedBatchSeconds ?? null,
    time_to_has_final_seconds: timings?.timeToHasFinalSeconds ?? null,
    time_to_completed_seconds: timings?.timeToCompletedSeconds ?? null,
  };
}

function buildPolicyRow(
  bundle: CaseBundle,
  metadata: ParsedPolicyMetadata | null,
): Chapter3PolicyRow {
  const requestedPolicy = normalizePolicyValue(
    metadata?.requestedTranslationStartPolicy ?? null,
  );
  const effectivePolicy = normalizePolicyValue(
    metadata?.effectiveTranslationStartPolicy ?? null,
  );

  return {
    case_id: bundle.caseId,
    media_id: inferMediaId(bundle),
    source_language:
      metadata?.sourceLanguage ??
      bundle.summary?.sourceLanguageFromStatus ??
      bundle.summary?.sourceLanguageFromFinalArtifact ??
      bundle.summary?.sourceLanguageRequested ??
      getNullableString(bundle.statusFinal?.sourceLanguage) ??
      inferSourceLanguageFromCaseId(bundle.caseId),
    requested_translation_start_policy: requestedPolicy,
    effective_translation_start_policy: effectivePolicy,
    auto_policy_downgraded:
      requestedPolicy && effectivePolicy
        ? requestedPolicy !== effectivePolicy
        : null,
    route: normalizeOptionalText(metadata?.route ?? null),
    asr_provider: normalizeOptionalText(metadata?.asrProvider ?? null),
    trust_gate_active: metadata?.trustGateActive ?? null,
    trust_stage: null,
    trust_decision: null,
    policy_metadata_source: metadata ? 'ai_engine_log' : 'not_available',
  };
}

function buildArtifactRow(bundle: CaseBundle): Chapter3ArtifactRow {
  const segments = bundle.finalArtifact?.segments ?? [];
  const artifactSummary =
    readArtifactSummary(bundle.artifactsInventory) ?? bundle.summary?.artifactSummary ?? null;
  const progressiveArtifactsBeforeFinal = inferProgressiveArtifactsBeforeFinal(
    bundle.summary?.milestoneTimings ?? null,
    bundle.statusTimeline,
  );

  let segmentsWithSourceText = 0;
  let segmentsWithTranslation = 0;
  let segmentsWithPhonetic = 0;
  let segmentsWithWords = 0;
  let emptySourceTextCount = 0;
  let emptyTranslationCount = 0;
  let missingPhoneticCount = 0;
  let missingSegmentIndexCount = 0;
  let validTimestampCount = 0;
  let invalidTimestampCount = 0;
  let negativeDurationCount = 0;
  let overlappingSegmentCount = 0;
  let nonMonotonicTimestampCount = 0;
  let tooShortSegmentCount = 0;
  let tooLongSegmentCount = 0;

  const validDurations: number[] = [];
  let previousStart: number | null = null;
  let previousEnd: number | null = null;

  for (const segment of segments) {
    const sourceText = (segment.text ?? '').trim();
    const translationText = (segment.translation ?? '').trim();
    const phoneticText = (segment.phonetic ?? '').trim();

    if (sourceText) {
      segmentsWithSourceText += 1;
    } else {
      emptySourceTextCount += 1;
    }

    if (translationText) {
      segmentsWithTranslation += 1;
    } else {
      emptyTranslationCount += 1;
    }

    if (phoneticText) {
      segmentsWithPhonetic += 1;
    } else {
      missingPhoneticCount += 1;
    }

    if (Array.isArray(segment.words) && segment.words.length > 0) {
      segmentsWithWords += 1;
    }

    if (typeof segment.segment_index !== 'number') {
      missingSegmentIndexCount += 1;
    }

    const isStartValid = Number.isFinite(segment.start);
    const isEndValid = Number.isFinite(segment.end);
    const hasNegativeDuration =
      isStartValid && isEndValid ? segment.end < segment.start : false;

    if (hasNegativeDuration) {
      negativeDurationCount += 1;
    }

    const isValidTimestamp =
      isStartValid && isEndValid && segment.end >= segment.start;
    if (!isValidTimestamp) {
      invalidTimestampCount += 1;
      continue;
    }

    validTimestampCount += 1;
    const duration = segment.end - segment.start;
    validDurations.push(duration);

    if (duration < TOO_SHORT_SEGMENT_SECONDS) {
      tooShortSegmentCount += 1;
    }
    if (duration > TOO_LONG_SEGMENT_SECONDS) {
      tooLongSegmentCount += 1;
    }

    if (previousEnd !== null && segment.start < previousEnd) {
      overlappingSegmentCount += 1;
    }
    if (
      (previousStart !== null && segment.start < previousStart) ||
      (previousEnd !== null && segment.end < previousEnd)
    ) {
      nonMonotonicTimestampCount += 1;
    }

    previousStart = segment.start;
    previousEnd = segment.end;
  }

  return {
    case_id: bundle.caseId,
    chunk_count: artifactSummary?.chunkCount ?? 0,
    translated_batch_count: artifactSummary?.translatedBatchCount ?? 0,
    has_final: artifactSummary?.hasFinal ?? bundle.finalJsonExists,
    final_segment_count: segments.length,
    chunk_first_exists: bundle.chunkFirstExists,
    translated_batch_first_exists: bundle.translatedBatchFirstExists,
    final_json_exists: bundle.finalJsonExists,
    progressive_artifacts_before_final: progressiveArtifactsBeforeFinal,
    segments_with_source_text: segmentsWithSourceText,
    segments_with_translation: segmentsWithTranslation,
    segments_with_phonetic: segmentsWithPhonetic,
    segments_with_words: segmentsWithWords,
    empty_source_text_count: emptySourceTextCount,
    empty_translation_count: emptyTranslationCount,
    missing_phonetic_count: missingPhoneticCount,
    missing_segment_index_count: missingSegmentIndexCount,
    valid_timestamp_count: validTimestampCount,
    invalid_timestamp_count: invalidTimestampCount,
    negative_duration_count: negativeDurationCount,
    overlapping_segment_count: overlappingSegmentCount,
    non_monotonic_timestamp_count: nonMonotonicTimestampCount,
    average_segment_duration_seconds:
      validDurations.length > 0 ? round(average(validDurations) ?? 0, 3) : null,
    too_short_segment_count: tooShortSegmentCount,
    too_long_segment_count: tooLongSegmentCount,
    schema_validation_status: validateFinalArtifactSchema(bundle.finalArtifact),
  };
}

function buildQualityRow(bundle: CaseBundle): Chapter3QualityRow {
  const cer = computeCer(bundle.referenceText, bundle.hypothesisText);
  const wer = bundle.summary?.wer ?? null;
  const status =
    bundle.summary?.completedStatus ?? getNullableString(bundle.statusFinal?.status) ?? '';
  const notes = [
    bundle.summary?.subtitleReference.werSkipReason,
    bundle.summary?.heuristic?.suspiciousFlags?.join(', ') || null,
    status === 'FAILED'
      ? getNullableString(bundle.statusFinal?.failReason) ?? 'case_failed'
      : null,
    !bundle.referenceText ? 'reference_unavailable' : null,
  ].filter((value): value is string => Boolean(value));

  return {
    case_id: bundle.caseId,
    wer_available: wer !== null,
    wer: wer?.finalWer ?? null,
    substitutions: wer?.substitutions ?? null,
    deletions: wer?.deletions ?? null,
    insertions: wer?.insertions ?? null,
    reference_token_count: wer?.referenceTokenCount ?? null,
    hypothesis_token_count: wer?.hypothesisTokenCount ?? null,
    cer_available: cer !== null,
    cer: cer?.cer ?? null,
    reference_char_count: cer?.referenceCharCount ?? null,
    hypothesis_char_count: cer?.hypothesisCharCount ?? null,
    quality_note: notes.join(' | ') || 'manual_review_required',
  };
}

function buildManualReviewRows(
  bundle: CaseBundle,
  limit: number,
): Chapter3ManualReviewRow[] {
  const segments =
    bundle.finalArtifact?.segments ??
    bundle.translatedBatchFirst?.segments ??
    [];
  return segments.slice(0, Math.max(0, limit)).map((segment) => ({
    case_id: bundle.caseId,
    segment_index:
      typeof segment.segment_index === 'number' ? segment.segment_index : null,
    start_seconds: Number.isFinite(segment.start) ? segment.start : null,
    end_seconds: Number.isFinite(segment.end) ? segment.end : null,
    source_text: segment.text ?? '',
    system_translation: segment.translation ?? '',
    phonetic: segment.phonetic ?? '',
    meaning_preservation_score: '',
    fluency_score: '',
    terminology_name_preservation_score: '',
    no_missing_important_information_score: '',
    subtitle_readability_score: '',
    reviewer_comment: '',
  }));
}

function resolveRunPaths(runDirInput: string): RunPaths {
  const absolute = resolve(runDirInput);
  const resultsDirCandidate = join(absolute, 'results');
  const resultsDir = existsSync(resultsDirCandidate) ? resultsDirCandidate : absolute;
  const runDir = existsSync(resultsDirCandidate) ? absolute : resolve(resultsDir, '..');
  const summaryCandidates = [
    join(resultsDir, 'suite.summary.json'),
    join(resultsDir, 'summary', 'e2e_wer_suite_summary.json'),
  ];
  const summaryPath = summaryCandidates.find((path) => existsSync(path)) ?? null;
  const manifestPath = existsSync(join(runDir, 'run.manifest.json'))
    ? join(runDir, 'run.manifest.json')
    : null;
  let logsDir: string | null = existsSync(join(runDir, 'logs'))
    ? join(runDir, 'logs')
    : null;

  if (!existsSync(resultsDir)) {
    throw new Error(`Results directory not found under ${absolute}`);
  }
  if (manifestPath) {
    const manifest = readJsonFile<Record<string, unknown>>(manifestPath);
    const manifestLogsDir = getNullableString(manifest?.logsDir);
    if (manifestLogsDir) {
      logsDir = resolve(manifestLogsDir);
    }
  }

  return {
    runDir,
    resultsDir,
    summaryPath,
    manifestPath,
    logsDir,
  };
}

function loadCaseBundles(resultsDir: string, suiteSummary: SuiteSummary | null): CaseBundle[] {
  const summaryCaseMap = new Map(
    (suiteSummary?.cases ?? []).map((entry) => [entry.caseId, entry]),
  );
  const caseIds = new Set<string>(summaryCaseMap.keys());
  for (const entry of readdirSync(resultsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'summary') {
      continue;
    }
    caseIds.add(entry.name);
  }

  return Array.from(caseIds)
    .sort()
    .map((caseId) => loadCaseBundle(resultsDir, caseId, summaryCaseMap.get(caseId) ?? null));
}

function loadCaseBundle(
  resultsDir: string,
  caseId: string,
  summary: CaseSummary | null,
): CaseBundle {
  const caseDir = join(resultsDir, caseId);
  const evaluationSummaryPath = existsSync(join(caseDir, 'evaluation.summary.json'))
    ? join(caseDir, 'evaluation.summary.json')
    : null;
  const statusFinalPath = existsSync(join(caseDir, 'status.final.json'))
    ? join(caseDir, 'status.final.json')
    : null;
  const statusTimelinePath = existsSync(join(caseDir, 'status.timeline.json'))
    ? join(caseDir, 'status.timeline.json')
    : null;
  const artifactsInventoryPath = existsSync(join(caseDir, 'artifacts.inventory.json'))
    ? join(caseDir, 'artifacts.inventory.json')
    : null;
  const finalJsonPath = existsSync(join(caseDir, 'final.json'))
    ? join(caseDir, 'final.json')
    : null;
  const translatedBatchFirstPath = existsSync(join(caseDir, 'translated_batch.first.json'))
    ? join(caseDir, 'translated_batch.first.json')
    : null;
  const chunkFirstPath = existsSync(join(caseDir, 'chunk.first.json'))
    ? join(caseDir, 'chunk.first.json')
    : null;

  return {
    caseId,
    caseDir,
    summary:
      summary ??
      (evaluationSummaryPath ? readJsonFile<CaseSummary>(evaluationSummaryPath) : null),
    statusFinal: statusFinalPath
      ? readJsonFile<Record<string, unknown>>(statusFinalPath)
      : null,
    statusTimeline:
      statusTimelinePath
        ? readJsonFile<StatusTimelineEntry[]>(statusTimelinePath) ?? []
        : [],
    artifactsInventory: artifactsInventoryPath
      ? readJsonFile<Record<string, unknown>>(artifactsInventoryPath)
      : null,
    finalArtifact: finalJsonPath ? readJsonFile<FinalArtifact>(finalJsonPath) : null,
    translatedBatchFirst: translatedBatchFirstPath
      ? readJsonFile<TranslatedBatchArtifact>(translatedBatchFirstPath)
      : null,
    chunkFirstExists: chunkFirstPath !== null,
    translatedBatchFirstExists: translatedBatchFirstPath !== null,
    finalJsonExists: finalJsonPath !== null,
    referenceText: readTextIfExists(join(caseDir, 'ground_truth.normalized.txt')),
    hypothesisText: readTextIfExists(join(caseDir, 'hypothesis.normalized.txt')),
    paths: {
      evaluationSummaryPath,
      statusFinalPath,
      statusTimelinePath,
      chunkFirstPath,
      translatedBatchFirstPath,
      finalJsonPath,
      artifactsInventoryPath,
    },
  };
}

function inferProgressiveArtifactsBeforeFinal(
  milestoneTimings: CaseSummary['milestoneTimings'] | null,
  timeline: StatusTimelineEntry[],
): 'yes' | 'no' | 'not_available' {
  const firstChunk =
    milestoneTimings?.timeToFirstChunkSeconds ??
    timeline.find((entry) => entry.artifacts.chunkCount > 0)?.tSeconds ??
    null;
  const firstBatch =
    milestoneTimings?.timeToFirstTranslatedBatchSeconds ??
    timeline.find((entry) => entry.artifacts.translatedBatchCount > 0)?.tSeconds ??
    null;
  const finalTime =
    milestoneTimings?.timeToHasFinalSeconds ??
    timeline.find((entry) => entry.artifacts.hasFinal)?.tSeconds ??
    null;

  const firstProgressive =
    [firstChunk, firstBatch]
      .filter((value): value is number => typeof value === 'number')
      .sort((left, right) => left - right)[0] ?? null;

  if (firstProgressive === null || finalTime === null) {
    return 'not_available';
  }
  return firstProgressive < finalTime ? 'yes' : 'no';
}

function loadPolicyMetadataByCase(
  logsDir: string | null,
  bundles: CaseBundle[],
): Map<string, ParsedPolicyMetadata> {
  if (!logsDir) {
    return new Map();
  }

  const mediaIdToCaseId = new Map<string, string>();
  for (const bundle of bundles) {
    const mediaId = inferMediaId(bundle);
    if (mediaId) {
      mediaIdToCaseId.set(mediaId, bundle.caseId);
    }
  }

  const byCase = new Map<string, ParsedPolicyMetadata>();
  const lines = ['ai-engine.log', 'ai-engine.err.log']
    .map((filename) => join(logsDir, filename))
    .filter((path) => existsSync(path))
    .flatMap((path) => readFileSync(path, 'utf8').split(/\r?\n/));
  let currentMediaId: string | null = null;

  for (const line of lines) {
    const jobStartMatch = line.match(/Job\s+\S+\s+started\s+\|\s+media:\s+([^\s|]+)/i);
    if (jobStartMatch) {
      currentMediaId = jobStartMatch[1];
      continue;
    }

    const routeMatch = line.match(
      /Source routing:\s+strategy=\S+\s+source=([^\s]+)\s+route=([^\s]+)\s+provider=([^\s]+)\s+policy=([^\s]+)\s+effective_policy=([^\s]+).*trust_gate_active=(True|False|true|false)/,
    );
    if (!routeMatch || !currentMediaId) {
      continue;
    }

    const caseId = mediaIdToCaseId.get(currentMediaId);
    if (!caseId || byCase.has(caseId)) {
      continue;
    }

    byCase.set(caseId, {
      mediaId: currentMediaId,
      sourceLanguage: normalizeOptionalText(routeMatch[1]),
      route: normalizeOptionalText(routeMatch[2]),
      asrProvider: normalizeOptionalText(routeMatch[3]),
      requestedTranslationStartPolicy: normalizePolicyValue(routeMatch[4]),
      effectiveTranslationStartPolicy: normalizePolicyValue(routeMatch[5]),
      trustGateActive: /^true$/i.test(routeMatch[6]),
    });
  }

  return byCase;
}

function validateFinalArtifactSchema(finalArtifact: FinalArtifact | null): string {
  if (!finalArtifact) {
    return 'missing_final_json';
  }
  if (!isRecord(finalArtifact.metadata)) {
    return 'invalid_metadata';
  }
  if (!Array.isArray(finalArtifact.segments)) {
    return 'invalid_segments';
  }

  const invalidSegments: string[] = [];
  finalArtifact.segments.forEach((segment, index) => {
    if (typeof segment.text !== 'string') {
      invalidSegments.push(`segment_${index}_text`);
    }
    if (typeof segment.translation !== 'string') {
      invalidSegments.push(`segment_${index}_translation`);
    }
    if (!Number.isFinite(segment.start)) {
      invalidSegments.push(`segment_${index}_start`);
    }
    if (!Number.isFinite(segment.end)) {
      invalidSegments.push(`segment_${index}_end`);
    }
  });

  if (invalidSegments.length === 0) {
    return 'valid';
  }
  return `invalid:${invalidSegments.slice(0, 5).join(',')}`;
}

function readArtifactSummary(
  inventory: Record<string, unknown> | null,
): MediaArtifactSummary | null {
  const summary = inventory?.summary;
  if (!isRecord(summary)) {
    return null;
  }
  return {
    chunkCount: getNullableNumber(summary.chunkCount) ?? 0,
    translatedBatchCount: getNullableNumber(summary.translatedBatchCount) ?? 0,
    hasFinal: Boolean(summary.hasFinal),
    latestChunkIndex: getNullableNumber(summary.latestChunkIndex),
    latestBatchIndex: getNullableNumber(summary.latestBatchIndex),
    finalObjectKey: getNullableString(summary.finalObjectKey),
  };
}

function buildCsv<T extends Record<string, unknown>>(rows: T[]): string {
  if (rows.length === 0) {
    return '';
  }
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      headers.map((header) => escapeCsvValue(row[header])).join(','),
    ),
  ];
  return `${lines.join('\n')}\n`;
}

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function renderChapter3BenchmarkReport(results: Chapter3Results): string {
  const performanceByFamily = aggregateByFamily(results.cases, results.performanceMetrics, results.qualityMetrics, results.artifactMetrics);
  const completedCases = results.cases.filter((entry) => entry.status === 'COMPLETED').length;
  const failedCases = results.cases.filter((entry) => entry.status === 'FAILED').length;
  const progressiveYes = results.artifactMetrics.filter(
    (entry) => entry.progressive_artifacts_before_final === 'yes',
  ).length;
  const schemaIssues = results.artifactMetrics.filter(
    (entry) => entry.schema_validation_status !== 'valid',
  );
  const policyAvailable = results.policyMetrics.filter(
    (entry) => entry.policy_metadata_source === 'ai_engine_log',
  ).length;
  const pollingIntervalText =
    results.run.pollingIntervalMs !== null
      ? `${results.run.pollingIntervalMs} ms`
      : 'not recorded (current evaluator default is 3000 ms unless a run used --poll-ms override)';

  const lines: string[] = [
    '# Chapter 3 Benchmark Report',
    '',
    'This package describes the current project as a **progressive asynchronous subtitle generation** system. It does not claim live simultaneous interpretation.',
    '',
    '## Run Context',
    `- Benchmark run path: ${results.run.runDir}`,
    `- Results directory: ${results.run.resultsDir}`,
    `- Logs directory: ${results.run.logsDir ?? 'not_available'}`,
    `- Command used: ${results.run.command ?? 'not_available'}`,
    `- Command source: ${results.run.commandSource}`,
    `- Polling interval recorded for this run: ${pollingIntervalText}`,
    `- Suite summary path: ${results.suite.summaryPath ?? 'not_available'}`,
    '',
    '## Environment Summary',
    `- Base URL: ${results.suite.baseUrl ?? 'not_available'}`,
    `- Target language: ${results.suite.targetLanguage ?? 'not_available'}`,
    `- Started at: ${results.suite.startedAt ?? 'not_available'}`,
    `- Finished at: ${results.suite.finishedAt ?? 'not_available'}`,
    `- Fixture counts from suite summary: ${results.suite.fixtureCounts ? JSON.stringify(results.suite.fixtureCounts) : 'not_available'}`,
    '',
    '## Dataset / Sample Summary',
    `- Cases exported: ${results.cases.length}`,
    `- Completed cases: ${completedCases}`,
    `- Failed cases: ${failedCases}`,
    `- Manual-subtitle-available cases: ${results.cases.filter((entry) => entry.manual_subtitle_available).length}`,
    '',
    '| Family | Cases | Avg Latency (s) | Avg Ratio | Avg First Chunk (s) | Avg First Batch (s) | Avg WER | Avg CER | Cases With Final | Progressive Before Final |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];

  for (const entry of performanceByFamily) {
    lines.push(
      `| ${entry.family} | ${entry.caseCount} | ${formatNumber(entry.avgLatency)} | ${formatNumber(entry.avgRatio)} | ${formatNumber(entry.avgFirstChunk)} | ${formatNumber(entry.avgFirstBatch)} | ${formatNumber(entry.avgWer)} | ${formatNumber(entry.avgCer)} | ${entry.casesWithFinal} | ${entry.progressiveBeforeFinal} |`,
    );
  }

  lines.push(
    '',
    '## Performance Summary Table',
    '',
    'All milestone timings below are observed via backend status polling. They are not exact socket, Redis, MinIO, or client-perceived timestamps, and their precision is limited by the polling interval.',
    '',
    '| Case | Status | Duration (s) | Wall Clock (s) | Ratio | First Chunk (s) | First Batch (s) | Has Final (s) | Completed (s) |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  );
  for (const metric of results.performanceMetrics) {
    const caseStatus = results.cases.find((entry) => entry.case_id === metric.case_id)?.status ?? 'not_available';
    lines.push(
      `| ${metric.case_id} | ${caseStatus} | ${formatNumber(metric.duration_seconds)} | ${formatNumber(metric.wall_clock_latency_seconds)} | ${formatNumber(metric.processing_to_duration_ratio)} | ${formatNumber(metric.time_to_first_chunk_seconds)} | ${formatNumber(metric.time_to_first_translated_batch_seconds)} | ${formatNumber(metric.time_to_has_final_seconds)} | ${formatNumber(metric.time_to_completed_seconds)} |`,
    );
  }

  lines.push(
    '',
    '## Translation Policy Summary',
    `- Cases with parsed per-case policy metadata from ai-engine.log: ${policyAvailable}/${results.policyMetrics.length}`,
    '- These fields are post-processed benchmark evidence only. They do not alter final.json or mobile-facing contracts.',
    '- trust_stage and trust_decision are left not_available in the current exporter unless future E2E evidence records them explicitly.',
    '',
    '| Case | Metadata Source | Requested Policy | Effective Policy | Auto Downgraded | Route | ASR Provider | Trust Gate Active | Source |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  );
  for (const metric of results.policyMetrics) {
    lines.push(
      `| ${metric.case_id} | ${metric.policy_metadata_source} | ${metric.requested_translation_start_policy ?? '-'} | ${metric.effective_translation_start_policy ?? '-'} | ${formatBoolean(metric.auto_policy_downgraded)} | ${metric.route ?? '-'} | ${metric.asr_provider ?? '-'} | ${formatBoolean(metric.trust_gate_active)} | ${metric.source_language ?? '-'} |`,
    );
  }

  lines.push(
    '',
    '## Artifact Completeness Summary Table',
    '| Case | Chunks | Batches | Final | Segments | Empty Translation | Missing Phonetic | Invalid Timestamps | Overlaps | Schema | Progressive Before Final |',
    '| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |',
  );
  for (const metric of results.artifactMetrics) {
    lines.push(
      `| ${metric.case_id} | ${metric.chunk_count} | ${metric.translated_batch_count} | ${metric.has_final ? 'yes' : 'no'} | ${metric.final_segment_count} | ${metric.empty_translation_count} | ${metric.missing_phonetic_count} | ${metric.invalid_timestamp_count} | ${metric.overlapping_segment_count} | ${metric.schema_validation_status} | ${metric.progressive_artifacts_before_final} |`,
    );
  }

  lines.push(
    '',
    '## Transcript Quality Summary Table',
    '| Case | WER | CER | Ref Tokens | Ref Chars | Quality Note |',
    '| --- | ---: | ---: | ---: | ---: | --- |',
  );
  for (const metric of results.qualityMetrics) {
    lines.push(
      `| ${metric.case_id} | ${formatNumber(metric.wer)} | ${formatNumber(metric.cer)} | ${formatNumber(metric.reference_token_count)} | ${formatNumber(metric.reference_char_count)} | ${metric.quality_note || '-'} |`,
    );
  }

  lines.push(
    '',
    '## Progressive Artifact Evidence Summary',
    `- Cases with inferable progressive artifacts before final completion: ${progressiveYes}/${results.artifactMetrics.length}`,
    '- This exporter infers progressive evidence from polling-observed evaluator milestones and saved status timelines.',
    '- progressive_artifacts_before_final is not a direct socket, Redis, MinIO, or client playback timestamp comparison.',
    '- Because the current E2E harness uses polling, these timings are useful but not exact socket-delivery timestamps.',
    '',
    '## Manual Translation Review Instructions',
    `- Review the generated CSV at \`chapter3_manual_translation_review.csv\`.`,
    `- The exporter includes the first ${results.manualReviewSampleSize} available segments per case from \`final.json\`, or \`translated_batch.first.json\` when final output is unavailable.`,
    '- Fill the score columns manually using a consistent 1-5 rubric.',
    '- Do not auto-claim translation quality improvements unless supported by manual review or a reliable reference-based metric.',
    '',
    '## Failures and Limitations',
    `- Failed cases are preserved in the Chapter 3 package when the run bundle contains their saved status/artifact files.`,
    '- CER becomes not_available when normalized reference or hypothesis text is absent.',
    '- Timestamp validity counts are heuristic checks over saved final segments.',
    `- Schema validation issues found: ${schemaIssues.length === 0 ? 'none' : schemaIssues.map((entry) => `${entry.case_id}:${entry.schema_validation_status}`).join('; ')}`,
    '- This package does not claim model training, fine-tuning, production HA, or live simultaneous interpretation.',
    '',
    '## Recommended Chapter 3 Tables',
    '- System runtime path table',
    '- Dataset/sample inventory table',
    '- End-to-end latency table',
    '- Artifact generation/completeness table',
    '- Transcript quality table',
    '- Manual translation review table',
    '',
    '## Recommended Screenshots / Figures To Capture',
    '- Processing screen with progress and current step',
    '- MinIO or artifact inventory showing chunks/, translated_batches/, and final.json',
    '- Mobile player using bilingual subtitles',
    '- Word lookup / explain popup if available',
  );

  return `${lines.join('\n')}\n`;
}

function renderChapter3EvidenceIndex(results: Chapter3Results): string {
  const lines: string[] = [
    '# Chapter 3 Evidence Index',
    '',
    `- Run directory: ${results.run.runDir}`,
    `- Results directory: ${results.run.resultsDir}`,
    `- Logs directory: ${results.run.logsDir ?? 'not_available'}`,
    '',
    '## Per-case Evidence Files',
    '| Case | evaluation.summary.json | status.timeline.json | chunk.first.json | translated_batch.first.json | final.json | artifacts.inventory.json |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];

  for (const entry of results.evidence.filesByCase) {
    lines.push(
      `| ${entry.caseId} | ${entry.evaluationSummaryPath ?? 'not_available'} | ${entry.statusTimelinePath ?? 'not_available'} | ${entry.chunkFirstPath ?? 'not_available'} | ${entry.translatedBatchFirstPath ?? 'not_available'} | ${entry.finalJsonPath ?? 'not_available'} | ${entry.artifactsInventoryPath ?? 'not_available'} |`,
    );
  }

  lines.push(
    '',
    '## Benchmark Logs',
    `- backend-api.log: ${results.run.logsDir ? join(results.run.logsDir, 'backend-api.log') : 'not_available'}`,
    `- backend-api.err.log: ${results.run.logsDir ? join(results.run.logsDir, 'backend-api.err.log') : 'not_available'}`,
    `- backend-worker.log: ${results.run.logsDir ? join(results.run.logsDir, 'backend-worker.log') : 'not_available'}`,
    `- backend-worker.err.log: ${results.run.logsDir ? join(results.run.logsDir, 'backend-worker.err.log') : 'not_available'}`,
    `- ai-engine.log: ${results.run.logsDir ? join(results.run.logsDir, 'ai-engine.log') : 'not_available'}`,
    `- ai-engine.err.log: ${results.run.logsDir ? join(results.run.logsDir, 'ai-engine.err.log') : 'not_available'}`,
    '',
    '## Suggested Screenshots',
  );

  for (const screenshot of results.evidence.suggestedScreenshots) {
    lines.push(`- ${screenshot}`);
  }

  return `${lines.join('\n')}\n`;
}

function aggregateByFamily(
  cases: Chapter3CaseRow[],
  performance: Chapter3PerformanceRow[],
  quality: Chapter3QualityRow[],
  artifacts: Chapter3ArtifactRow[],
) {
  const families = Array.from(
    new Set(cases.map((entry) => entry.language_family ?? 'unknown')),
  );

  return families.map((family) => {
    const caseIds = cases
      .filter((entry) => (entry.language_family ?? 'unknown') === family)
      .map((entry) => entry.case_id);
    const perf = performance.filter((entry) => caseIds.includes(entry.case_id));
    const qual = quality.filter((entry) => caseIds.includes(entry.case_id));
    const art = artifacts.filter((entry) => caseIds.includes(entry.case_id));
    return {
      family,
      caseCount: caseIds.length,
      avgLatency: average(perf.map((entry) => entry.wall_clock_latency_seconds)),
      avgRatio: average(perf.map((entry) => entry.processing_to_duration_ratio)),
      avgFirstChunk: average(perf.map((entry) => entry.time_to_first_chunk_seconds)),
      avgFirstBatch: average(
        perf.map((entry) => entry.time_to_first_translated_batch_seconds),
      ),
      avgWer: average(
        qual
          .filter((entry) => entry.wer_available)
          .map((entry) => entry.wer),
      ),
      avgCer: average(
        qual
          .filter((entry) => entry.cer_available)
          .map((entry) => entry.cer),
      ),
      casesWithFinal: art.filter((entry) => entry.has_final).length,
      progressiveBeforeFinal: art.filter(
        (entry) => entry.progressive_artifacts_before_final === 'yes',
      ).length,
    };
  });
}

function formatBoolean(value: boolean | null): string {
  if (value === null) {
    return '-';
  }
  return value ? 'true' : 'false';
}

function formatNumber(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return '-';
  }
  return String(round(value, 3));
}

function resolveCommandString(
  explicitCommand: string | null,
  manifest: Record<string, unknown> | null,
  runDir: string,
): { command: string | null; source: 'explicit' | 'manifest_inferred' | 'not_available' } {
  if (explicitCommand && explicitCommand.trim()) {
    return {
      command: explicitCommand.trim(),
      source: 'explicit',
    };
  }

  if (manifest) {
    const parts = [
      'powershell -ExecutionPolicy Bypass -File scripts\\run-e2e-youtube-pipeline.ps1',
    ];
    const caseIds = Array.isArray(manifest.caseIds)
      ? manifest.caseIds.filter((value): value is string => typeof value === 'string')
      : [];
    const targetLanguage = getNullableString(manifest.targetLanguage);
    if (caseIds.length > 0) {
      parts.push(`-CaseIds ${caseIds.join(',')}`);
    }
    if (targetLanguage) {
      parts.push(`-TargetLanguage ${targetLanguage}`);
    }
    const pollMs = resolvePollingIntervalMs(manifest);
    if (pollMs !== null) {
      parts.push(`-PollMs ${pollMs}`);
    }
    parts.push(`-OutputDir ${runDir}`);
    return {
      command: parts.join(' '),
      source: 'manifest_inferred',
    };
  }

  return {
    command: null,
    source: 'not_available',
  };
}

function inferSourceType(url: string | null): string {
  if (!url) {
    return 'not_available';
  }
  if (/youtu(\.be|be\.com)/i.test(url)) {
    return 'youtube';
  }
  return 'url';
}

function inferManualSubtitleAvailable(bundle: CaseBundle): boolean {
  if (bundle.summary?.subtitleReference.werSkipReason === 'manual_subtitles_unavailable') {
    return false;
  }
  const manualTags = bundle.summary?.subtitleReference.availableManualTags ?? [];
  if (manualTags.length > 0) {
    return true;
  }
  if (bundle.referenceText) {
    return true;
  }
  return bundle.summary?.subtitleReference.manualSubtitlesAvailable ?? false;
}

function inferMediaId(bundle: CaseBundle): string | null {
  const inventoryMediaId = getNullableString(bundle.artifactsInventory?.mediaId);
  return bundle.summary?.mediaId ?? inventoryMediaId ?? null;
}

function normalizeOptionalText(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'unknown' || trimmed === '-') {
    return null;
  }
  return trimmed;
}

function normalizePolicyValue(value: string | null): string | null {
  return normalizeOptionalText(value);
}

function resolvePollingIntervalMs(
  manifest: Record<string, unknown> | null,
): number | null {
  return manifest ? getNullableNumber(manifest.pollMs) : null;
}

function inferFamilyFromCaseId(caseId: string): string | null {
  if (caseId.startsWith('english_')) {
    return 'english';
  }
  if (caseId.startsWith('chinese_')) {
    return 'chinese';
  }
  return null;
}

function inferSourceLanguageFromCaseId(caseId: string): string | null {
  if (caseId.startsWith('english_')) {
    return 'en';
  }
  if (caseId.startsWith('chinese_')) {
    return 'zh';
  }
  return null;
}

function getNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function getNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readJsonFile<T>(path: string): T | null {
  if (!existsSync(path)) {
    return null;
  }
  const raw = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw) as T;
}

function readTextIfExists(path: string): string | null {
  if (!existsSync(path)) {
    return null;
  }
  const value = readFileSync(path, 'utf8').trim();
  return value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
