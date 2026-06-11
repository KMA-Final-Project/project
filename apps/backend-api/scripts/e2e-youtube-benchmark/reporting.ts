import type {
  ArtifactHeuristics,
  CaseSummary,
  FinalArtifact,
  SuiteSummary,
} from './types';
import { average, processingRatioDisplay, round } from './utils';

export function evaluateArtifactHeuristics(
  finalArtifact: FinalArtifact,
  family: CaseSummary['family'],
): ArtifactHeuristics {
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
  const sourceLang = (finalArtifact.metadata.source_lang ?? '').toLowerCase();
  const modelUsed = (finalArtifact.metadata.model_used ?? '').toLowerCase();

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

export function buildSuiteSummary(input: {
  startedAt: string;
  finishedAt: string;
  baseUrl: string;
  targetLanguage: string;
  runDirectory: string;
  summaryJsonPath: string;
  summaryMarkdownPath: string;
  cases: CaseSummary[];
}): SuiteSummary {
  const werEligibleCases = input.cases.filter((entry) => entry.wer !== null);
  const familyAggregate = Object.fromEntries(
    ['english', 'chinese'].map((family) => {
      const cases = input.cases.filter((entry) => entry.family === family);
      const scored = cases.filter((entry) => entry.wer !== null);
      const averageRatio = average(cases.map((entry) => entry.processingToDurationRatio));
      return [
        family,
        {
          caseCount: cases.length,
          werEligibleCount: scored.length,
          averageWer: average(scored.map((entry) => entry.wer?.finalWer)),
          averageLatencySeconds: average(cases.map((entry) => entry.wallClockLatencySeconds)),
          averageProcessingToDurationRatio: averageRatio,
          averageProcessingToDurationRatioDisplay: processingRatioDisplay(averageRatio),
        },
      ];
    }),
  );

  const averageRatio = average(
    input.cases.map((entry) => entry.processingToDurationRatio),
  );

  return {
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    baseUrl: input.baseUrl,
    targetLanguage: input.targetLanguage,
    runDirectory: input.runDirectory,
    summaryJsonPath: input.summaryJsonPath,
    summaryMarkdownPath: input.summaryMarkdownPath,
    fixtureCounts: {
      total: input.cases.length,
      english: input.cases.filter((entry) => entry.family === 'english').length,
      chinese: input.cases.filter((entry) => entry.family === 'chinese').length,
      werEligible: werEligibleCases.length,
      werSkipped: input.cases.length - werEligibleCases.length,
    },
    aggregate: {
      averageWer: average(werEligibleCases.map((entry) => entry.wer?.finalWer)),
      averageLatencySeconds: average(
        input.cases.map((entry) => entry.wallClockLatencySeconds),
      ),
      averageProcessingToDurationRatio: averageRatio,
      averageProcessingToDurationRatioDisplay: processingRatioDisplay(averageRatio),
      averageTimeToFirstChunkSeconds: average(
        input.cases.map((entry) => entry.milestoneTimings.timeToFirstChunkSeconds),
      ),
      averageTimeToFirstTranslatedBatchSeconds: average(
        input.cases.map(
          (entry) => entry.milestoneTimings.timeToFirstTranslatedBatchSeconds,
        ),
      ),
    },
    familyAggregate,
    cases: input.cases,
  };
}

export function renderSuiteMarkdown(summary: SuiteSummary): string {
  const lines: string[] = [
    '# E2E YouTube WER Suite',
    '',
    `- Started: ${summary.startedAt}`,
    `- Finished: ${summary.finishedAt}`,
    `- Base URL: ${summary.baseUrl}`,
    `- Target language: ${summary.targetLanguage}`,
    `- Run directory: ${summary.runDirectory}`,
    `- Fixtures: ${summary.fixtureCounts.total} total (${summary.fixtureCounts.english} English, ${summary.fixtureCounts.chinese} Chinese)`,
    `- WER-scored fixtures: ${summary.fixtureCounts.werEligible}`,
    `- Latency-only fixtures: ${summary.fixtureCounts.werSkipped}`,
    '',
    '## Aggregate',
    `- Average WER: ${formatNumber(summary.aggregate.averageWer)}`,
    `- Average wall-clock latency: ${formatNumber(summary.aggregate.averageLatencySeconds)} s`,
    `- Average processing-to-duration ratio: ${summary.aggregate.averageProcessingToDurationRatioDisplay ?? '-'}`,
    `- Average time to first chunk: ${formatNumber(summary.aggregate.averageTimeToFirstChunkSeconds)} s`,
    `- Average time to first translated batch: ${formatNumber(summary.aggregate.averageTimeToFirstTranslatedBatchSeconds)} s`,
    '',
    '## By Family',
    '| Family | Cases | WER Scored | Avg WER | Avg Latency (s) | Avg Ratio |',
    '| --- | ---: | ---: | ---: | ---: | --- |',
  ];

  for (const family of ['english', 'chinese']) {
    const entry = summary.familyAggregate[family];
    lines.push(
      `| ${family} | ${entry.caseCount} | ${entry.werEligibleCount} | ${formatNumber(entry.averageWer)} | ${formatNumber(entry.averageLatencySeconds)} | ${entry.averageProcessingToDurationRatioDisplay ?? '-'} |`,
    );
  }

  lines.push(
    '',
    '## Cases',
    '| Case | Family | Duration (s) | Wall Clock (s) | Ratio | First Chunk (s) | First Batch (s) | WER | S | D | I | Ref N | Subtitle Tag | Notes |',
    '| --- | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |',
  );

  for (const entry of summary.cases) {
    const note = entry.subtitleReference.werSkipReason
      ? entry.subtitleReference.werSkipReason
      : (entry.heuristic?.suspiciousFlags ?? []).join(', ') || '-';
    lines.push(
      `| ${entry.caseId} | ${entry.family} | ${formatNumber(entry.durationSeconds)} | ${formatNumber(entry.wallClockLatencySeconds)} | ${entry.processingToDurationRatioDisplay} | ${formatNumber(entry.milestoneTimings.timeToFirstChunkSeconds)} | ${formatNumber(entry.milestoneTimings.timeToFirstTranslatedBatchSeconds)} | ${formatNumber(entry.wer?.finalWer ?? null)} | ${entry.wer?.substitutions ?? '-'} | ${entry.wer?.deletions ?? '-'} | ${entry.wer?.insertions ?? '-'} | ${entry.wer?.referenceTokenCount ?? '-'} | ${entry.subtitleReference.selectedLanguageTag ?? '-'} | ${note} |`,
    );
  }

  const finalizationCases = summary.cases.filter((entry) => entry.finalization !== null);
  if (finalizationCases.length > 0) {
    lines.push(
      '',
      '## Finalization',
      '| Case | Coverage Segs | Coverage Dur (s) | Attempted | Completed | Timed Out | Invalid | Fallback | Cost (USD) | Deadline Hit | LLM Revised |',
      '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |',
    );

    for (const entry of finalizationCases) {
      const f = entry.finalization!;
      const llmRevisedSegments = f.segmentProvenance.filter((p) => p.source === 'llm_revision').length;
      lines.push(
        `| ${entry.caseId} | ${f.coverageSegments} | ${formatNumber(f.coverageDurationSeconds)} | ${f.attemptedWindows} | ${f.completedWindows} | ${f.timedOutWindows} | ${f.invalidWindows} | ${f.fallbackSegments} | ${formatNumber(f.totalCostUsd)} | ${f.finalizationDeadlineHit ? 'yes' : 'no'} | ${llmRevisedSegments} |`,
      );
    }

    const totalCost = finalizationCases.reduce((sum, e) => sum + (e.finalization?.totalCostUsd ?? 0), 0);
    const totalAttempted = finalizationCases.reduce((sum, e) => sum + (e.finalization?.attemptedWindows ?? 0), 0);
    const totalCompleted = finalizationCases.reduce((sum, e) => sum + (e.finalization?.completedWindows ?? 0), 0);
    const totalTimedOut = finalizationCases.reduce((sum, e) => sum + (e.finalization?.timedOutWindows ?? 0), 0);
    const totalFallback = finalizationCases.reduce((sum, e) => sum + (e.finalization?.fallbackSegments ?? 0), 0);
    const deadlineHits = finalizationCases.filter((e) => e.finalization?.finalizationDeadlineHit).length;

    lines.push(
      '',
      `**Finalization totals:** ${finalizationCases.length} case(s) | windows: ${totalAttempted} attempted, ${totalCompleted} completed, ${totalTimedOut} timed out | fallback segments: ${totalFallback} | total cost: $${formatNumber(totalCost)} | deadline hits: ${deadlineHits}/${finalizationCases.length}`,
    );
  }

  lines.push('', '## Notes');
  lines.push(
    '- WER is computed only when a manual subtitle track is available through yt-dlp.',
  );
  lines.push(
    '- Latency is measured from the start of the live POST /media/youtube request through the first observed COMPLETED status.',
  );
  lines.push(
    '- Subtitle acquisition time is tracked separately and does not affect wall-clock pipeline latency.',
  );
  lines.push(
    '- Per-case bundles include both translated_batch.first.json and final.json so progressive artifact regressions remain visible.',
  );

  return `${lines.join('\n')}\n`;
}

function formatNumber(value: number | null): string {
  if (value === null) {
    return '-';
  }
  return String(round(value, 3));
}
