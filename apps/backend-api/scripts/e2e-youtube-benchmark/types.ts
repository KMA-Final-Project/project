export type SourceLanguage = 'en' | 'zh';

export type UserProfile = {
  id: string;
  email: string;
  fullName: string;
  emailVerified: boolean;
};

export type LoginResponse = {
  user: UserProfile;
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
};

export type SubmitYoutubeResponse = {
  id: string;
  title: string;
  status: string;
  originUrl: string | null;
  jobId: string;
  targetLanguage?: string | null;
};

export type MediaArtifactSummary = {
  chunkCount: number;
  translatedBatchCount: number;
  hasFinal: boolean;
  latestChunkIndex: number | null;
  latestBatchIndex: number | null;
  finalObjectKey: string | null;
};

export type MediaStatusResponse = {
  id: string;
  title: string;
  status: string;
  progress: number;
  sourceLanguage: string | null;
  targetLanguage: string | null;
  durationSeconds: number;
  failReason: string | null;
  currentStep: string | null;
  estimatedTimeRemaining: number | null;
  artifacts: MediaArtifactSummary;
};

export type MediaArtifactsResponse = {
  mediaId: string;
  status: string;
  summary: MediaArtifactSummary;
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

export type FinalArtifact = {
  metadata: {
    duration: number;
    engine_profile?: string;
    source_lang?: string;
    target_lang?: string;
    model_used?: string;
    [key: string]: unknown;
  };
  segments: Array<{
    segment_index?: number | null;
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
      [key: string]: unknown;
    }>;
  }>;
};

export type TranslatedBatchArtifact = {
  batch_index: number;
  first_segment_index: number;
  segments: FinalArtifact['segments'];
};

export type StatusTimelineEntry = {
  tSeconds: number;
  at: string;
  status: string;
  progress: number;
  currentStep: string | null;
  estimatedTimeRemaining: number | null;
  sourceLanguage: string | null;
  targetLanguage: string | null;
  artifacts: MediaArtifactSummary;
};

export type MilestoneTimings = {
  submitRequestStartedAt: string;
  submitResponseReceivedAt: string;
  submitRoundTripMs: number;
  timeToValidatingSeconds: number | null;
  timeToProcessingSeconds: number | null;
  timeToFirstChunkSeconds: number | null;
  timeToFirstTranslatedBatchSeconds: number | null;
  timeToHasFinalSeconds: number | null;
  timeToCompletedSeconds: number;
};

export type LanguageTagCatalog = {
  manual: string[];
  automatic: string[];
};

export type SubtitleSelection = {
  languageTag: string;
  availableManualTags: string[];
  availableAutomaticTags: string[];
};

export type SubtitleDownloadResult = {
  subtitlePath: string;
  languageTag: string;
  format: string;
  availableManualTags: string[];
  availableAutomaticTags: string[];
  cueTexts: string[];
  acquisitionSeconds: number;
};

export type WerBreakdown = {
  substitutions: number;
  deletions: number;
  insertions: number;
  referenceTokenCount: number;
  hypothesisTokenCount: number;
  finalWer: number;
};

export type ArtifactHeuristics = {
  segmentCount: number;
  emptyTranslationCount: number;
  avgSourceLength: number;
  emojiSourceCount: number;
  emojiTranslationCount: number;
  controlTokenCount: number;
  hanCount: number;
  latinCount: number;
  segmentsWithLatin: number;
  suspiciousFlags: string[];
};

export type CaseDefinition = {
  caseId: string;
  family: 'english' | 'chinese';
  sourceLanguage: SourceLanguage;
  url: string;
};

export type CasePaths = {
  caseDir: string;
  normalizedReferencePath: string;
  normalizedHypothesisPath: string;
  evaluationSummaryPath: string;
};

export type CaseSummary = {
  caseId: string;
  family: 'english' | 'chinese';
  sourceLanguageRequested: SourceLanguage;
  url: string;
  mediaId: string;
  title: string;
  jobId: string;
  submittedStatus: string;
  completedStatus: string;
  outputDir: string;
  durationSeconds: number;
  wallClockLatencySeconds: number;
  processingToDurationRatio: number;
  processingToDurationRatioDisplay: string;
  throughputMultiplier: number;
  milestoneTimings: MilestoneTimings;
  statusTimeline: StatusTimelineEntry[];
  sourceLanguageFromStatus: string | null;
  sourceLanguageFromFinalArtifact: string | null;
  targetLanguageRequested: string;
  targetLanguageFromStatus: string | null;
  targetLanguageFromFinalArtifact: string | null;
  finalMetadata: FinalArtifact['metadata'] | null;
  artifactSummary: MediaArtifactSummary;
  subtitleReference: {
    manualSubtitlesAvailable: boolean;
    automaticCaptionsAvailable: boolean;
    selectedLanguageTag: string | null;
    subtitleFormat: string | null;
    subtitleAcquisitionSeconds: number | null;
    werEligible: boolean;
    werSkipReason: string | null;
    availableManualTags: string[];
    availableAutomaticTags: string[];
  };
  tokens: {
    reference: number | null;
    hypothesis: number;
  };
  wer: WerBreakdown | null;
  heuristic: ArtifactHeuristics | null;
  artifacts: {
    finalUrl: string | null;
    firstChunkUrl: string | null;
    firstTranslatedBatchUrl: string | null;
  };
  samples: {
    firstSegments: FinalArtifact['segments'];
    firstTranslatedBatchSegments: FinalArtifact['segments'] | null;
  };
};

export type SuiteSummary = {
  startedAt: string;
  finishedAt: string;
  baseUrl: string;
  targetLanguage: string;
  runDirectory: string;
  summaryJsonPath: string;
  summaryMarkdownPath: string;
  fixtureCounts: {
    total: number;
    english: number;
    chinese: number;
    werEligible: number;
    werSkipped: number;
  };
  aggregate: {
    averageWer: number | null;
    averageLatencySeconds: number | null;
    averageProcessingToDurationRatio: number | null;
    averageProcessingToDurationRatioDisplay: string | null;
    averageTimeToFirstChunkSeconds: number | null;
    averageTimeToFirstTranslatedBatchSeconds: number | null;
  };
  familyAggregate: Record<
    string,
    {
      caseCount: number;
      werEligibleCount: number;
      averageWer: number | null;
      averageLatencySeconds: number | null;
      averageProcessingToDurationRatio: number | null;
      averageProcessingToDurationRatioDisplay: string | null;
    }
  >;
  cases: CaseSummary[];
};

export type BenchmarkOptions = {
  baseUrl: string;
  caseIds: string[];
  outputDir: string;
  targetLanguage: string;
  pollIntervalMs: number;
  throttleBackoffMs: number;
  timeoutMs: number;
};

export type TranslationFinalizationMetrics = {
  enabled: boolean;
  coverageSegments: number;
  coverageDurationSeconds: number;
  attemptedWindows: number;
  completedWindows: number;
  timedOutWindows: number;
  invalidWindows: number;
  fallbackSegments: number;
  totalCostUsd: number;
  finalizationDeadlineHit: boolean;
};

export type SegmentTranslationProvenance = {
  segmentIndex: number;
  source: 'nmt' | 'llm_revision';
  revisionIndex: number | null;
};

export type TranslationJudgeResult = {
  winner: 'nmt' | 'llm_final' | 'tie';
  scores: {
    meaning: number;
    fluency: number;
    consistency: number;
    readability: number;
  };
  rationale?: string;
};
