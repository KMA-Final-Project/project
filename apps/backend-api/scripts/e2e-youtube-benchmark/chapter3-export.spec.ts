import { afterEach, describe, expect, it } from '@jest/globals';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  computeCer,
  exportChapter3BenchmarkPackage,
} from './chapter3-export';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('chapter3 exporter helpers', () => {
  it('computes CER on whitespace-insensitive character streams', () => {
    const cer = computeCer('你 好 世 界', '你好世');

    expect(cer).not.toBeNull();
    expect(cer?.referenceCharCount).toBe(4);
    expect(cer?.hypothesisCharCount).toBe(3);
    expect(cer?.deletions).toBe(1);
    expect(cer?.cer).toBe(0.25);
  });

  it('exports a chapter3 package from a saved run bundle and keeps failed cases visible', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'chapter3-export-'));
    tempDirs.push(workspace);

    const runDir = join(workspace, 'run');
    const resultsDir = join(runDir, 'results');
    const logsDir = join(runDir, 'logs');
    const successCaseDir = join(resultsDir, 'english_demo');
    const failedCaseDir = join(resultsDir, 'chinese_failedcase');
    const outDir = join(workspace, 'docs-experiments');

    mkdirp(successCaseDir);
    mkdirp(failedCaseDir);
    mkdirp(logsDir);

    const successSummary = {
      caseId: 'english_demo',
      family: 'english',
      sourceLanguageRequested: 'en',
      url: 'https://www.youtube.com/watch?v=demo123',
      mediaId: 'media-success',
      title: '[E2E WER] english_demo',
      jobId: '1',
      submittedStatus: 'QUEUED',
      completedStatus: 'COMPLETED',
      outputDir: successCaseDir,
      durationSeconds: 100,
      wallClockLatencySeconds: 25,
      processingToDurationRatio: 0.25,
      processingToDurationRatioDisplay: '1:0.25',
      throughputMultiplier: 4,
      milestoneTimings: {
        submitRequestStartedAt: '2026-06-11T00:00:00.000Z',
        submitResponseReceivedAt: '2026-06-11T00:00:00.100Z',
        submitRoundTripMs: 100,
        timeToValidatingSeconds: 1,
        timeToProcessingSeconds: 2,
        timeToFirstChunkSeconds: 5,
        timeToFirstTranslatedBatchSeconds: 8,
        timeToHasFinalSeconds: 20,
        timeToCompletedSeconds: 25,
      },
      statusTimeline: [
        timelineEntry(0.1, 'QUEUED', 0, 0, 0, false),
        timelineEntry(5, 'PROCESSING', 1, 0, 0.3, false),
        timelineEntry(8, 'PROCESSING', 2, 1, 0.7, false),
        timelineEntry(20, 'COMPLETED', 2, 1, 1, true),
      ],
      sourceLanguageFromStatus: 'en',
      sourceLanguageFromFinalArtifact: 'en',
      targetLanguageRequested: 'vi',
      targetLanguageFromStatus: 'vi',
      targetLanguageFromFinalArtifact: 'vi',
      finalMetadata: {
        duration: 100,
        source_lang: 'en',
        target_lang: 'vi',
        model_used: 'demo-model',
      },
      artifactSummary: {
        chunkCount: 2,
        translatedBatchCount: 1,
        hasFinal: true,
        latestChunkIndex: 1,
        latestBatchIndex: 0,
        finalObjectKey: 'media-success/final.json',
      },
      subtitleReference: {
        manualSubtitlesAvailable: true,
        automaticCaptionsAvailable: true,
        selectedLanguageTag: 'en',
        subtitleFormat: 'vtt',
        subtitleAcquisitionSeconds: 1.2,
        werEligible: true,
        werSkipReason: null,
        availableManualTags: ['en'],
        availableAutomaticTags: ['en'],
      },
      tokens: {
        reference: 10,
        hypothesis: 10,
      },
      wer: {
        substitutions: 1,
        deletions: 0,
        insertions: 0,
        referenceTokenCount: 10,
        hypothesisTokenCount: 10,
        finalWer: 0.1,
      },
      heuristic: null,
      artifacts: {
        finalUrl: 'https://example.com/final.json',
        firstChunkUrl: 'https://example.com/chunk.json',
        firstTranslatedBatchUrl: 'https://example.com/batch.json',
      },
      samples: {
        firstSegments: [],
        firstTranslatedBatchSegments: null,
      },
      finalization: null,
    };

    writeJson(join(resultsDir, 'suite.summary.json'), {
      startedAt: '2026-06-11T00:00:00.000Z',
      finishedAt: '2026-06-11T00:01:00.000Z',
      baseUrl: 'http://localhost:3000/api',
      targetLanguage: 'vi',
      runDirectory: resultsDir,
      summaryJsonPath: join(resultsDir, 'suite.summary.json'),
      summaryMarkdownPath: join(resultsDir, 'suite.summary.md'),
      fixtureCounts: {
        total: 1,
        english: 1,
        chinese: 0,
        werEligible: 1,
        werSkipped: 0,
      },
      aggregate: {
        averageWer: 0.1,
        averageLatencySeconds: 25,
        averageProcessingToDurationRatio: 0.25,
        averageProcessingToDurationRatioDisplay: '1:0.25',
        averageTimeToFirstChunkSeconds: 5,
        averageTimeToFirstTranslatedBatchSeconds: 8,
      },
      familyAggregate: {
        english: {
          caseCount: 1,
          werEligibleCount: 1,
          averageWer: 0.1,
          averageLatencySeconds: 25,
          averageProcessingToDurationRatio: 0.25,
          averageProcessingToDurationRatioDisplay: '1:0.25',
        },
        chinese: {
          caseCount: 0,
          werEligibleCount: 0,
          averageWer: null,
          averageLatencySeconds: null,
          averageProcessingToDurationRatio: null,
          averageProcessingToDurationRatioDisplay: null,
        },
      },
      cases: [successSummary],
    });

    writeJson(join(runDir, 'run.manifest.json'), {
      startedAt: '2026-06-11T00:00:00.000Z',
      outputDir: runDir,
      resultsDir,
      logsDir,
      targetLanguage: 'vi',
      caseIds: ['english_demo'],
      pollMs: 1000,
    });

    writeText(
      join(logsDir, 'ai-engine.log'),
      [
        '2026-06-11 00:00:01 | INFO | main | 🚀 Job 1 started | media: media-success | duration: 100s',
        '2026-06-11 00:00:02 | INFO | async_pipeline | 🧭 Source routing: strategy=hint source=en route=distil_whisper_en provider=faster_whisper policy=during_asr effective_policy=during_asr chinese_prior_score=0.00 trust_gate_active=False',
        '2026-06-11 00:00:03 | INFO | main | 🚀 Job 2 started | media: media-failed | duration: 0s',
        '2026-06-11 00:00:04 | INFO | async_pipeline | 🧭 Source routing: strategy=hint source=zh route=paraformer_zh provider=sensevoice policy=during_asr effective_policy=after_asr chinese_prior_score=0.98 trust_gate_active=True',
      ].join('\n'),
    );

    writeJson(join(successCaseDir, 'evaluation.summary.json'), successSummary);
    writeJson(join(successCaseDir, 'status.final.json'), {
      status: 'COMPLETED',
      failReason: null,
      sourceLanguage: 'en',
      targetLanguage: 'vi',
      durationSeconds: 100,
      artifacts: successSummary.artifactSummary,
    });
    writeJson(join(successCaseDir, 'status.timeline.json'), successSummary.statusTimeline);
    writeJson(join(successCaseDir, 'artifacts.inventory.json'), {
      mediaId: 'media-success',
      status: 'COMPLETED',
      summary: successSummary.artifactSummary,
      chunks: [{ chunkIndex: 0, objectKey: 'media-success/chunks/0.json', url: 'https://example.com/chunk.json', size: 12, lastModified: '2026-06-11T00:00:05.000Z' }],
      translatedBatches: [{ batchIndex: 0, objectKey: 'media-success/translated_batches/0.json', url: 'https://example.com/batch.json', size: 30, lastModified: '2026-06-11T00:00:08.000Z' }],
      final: { objectKey: 'media-success/final.json', url: 'https://example.com/final.json', size: 80, lastModified: '2026-06-11T00:00:20.000Z' },
    });
    writeJson(join(successCaseDir, 'chunk.first.json'), [
      { text: 'Hello world', start: 0, end: 1.5, translation: 'Xin chao', segment_index: 0 },
    ]);
    writeJson(join(successCaseDir, 'translated_batch.first.json'), {
      batch_index: 0,
      first_segment_index: 0,
      segments: [
        { segment_index: 0, text: 'Hello world', translation: 'Xin chao the gioi', phonetic: '', start: 0, end: 1.5, words: [{ word: 'Hello', start: 0, end: 0.5 }] },
      ],
    });
    writeJson(join(successCaseDir, 'final.json'), {
      metadata: successSummary.finalMetadata,
      segments: [
        {
          segment_index: 0,
          text: 'Hello world',
          translation: 'Xin chao the gioi',
          phonetic: '',
          start: 0,
          end: 1.5,
          words: [{ word: 'Hello', start: 0, end: 0.5 }],
        },
        {
          segment_index: 1,
          text: 'Second line',
          translation: '',
          phonetic: 'sek-ond',
          start: 1.4,
          end: 20,
          words: [],
        },
      ],
    });
    writeText(join(successCaseDir, 'ground_truth.normalized.txt'), '你 好 世 界');
    writeText(join(successCaseDir, 'hypothesis.normalized.txt'), '你好世');

    writeJson(join(failedCaseDir, 'status.final.json'), {
      status: 'FAILED',
      failReason: 'download_failed',
      sourceLanguage: 'zh',
      targetLanguage: 'vi',
      durationSeconds: 0,
      artifacts: {
        chunkCount: 0,
        translatedBatchCount: 0,
        hasFinal: false,
        latestChunkIndex: null,
        latestBatchIndex: null,
        finalObjectKey: null,
      },
    });
    writeJson(join(failedCaseDir, 'status.timeline.json'), [
      timelineEntry(0.1, 'QUEUED', 0, 0, 0, false),
      timelineEntry(2, 'FAILED', 0, 0, 0, false),
    ]);
    writeJson(join(failedCaseDir, 'artifacts.inventory.json'), {
      mediaId: 'media-failed',
      status: 'FAILED',
      summary: {
        chunkCount: 0,
        translatedBatchCount: 0,
        hasFinal: false,
        latestChunkIndex: null,
        latestBatchIndex: null,
        finalObjectKey: null,
      },
      chunks: [],
      translatedBatches: [],
      final: null,
    });

    const outputs = exportChapter3BenchmarkPackage({
      runDir,
      outDir,
      manualReviewLimit: 2,
      command: 'powershell -ExecutionPolicy Bypass -File scripts\\run-e2e-youtube-pipeline.ps1 -CaseIds english_demo',
    });

    expect(existsSync(outputs.resultsJsonPath)).toBe(true);
    expect(existsSync(outputs.casesCsvPath)).toBe(true);
    expect(existsSync(outputs.performanceCsvPath)).toBe(true);
    expect(existsSync(outputs.policyCsvPath)).toBe(true);
    expect(existsSync(outputs.artifactCsvPath)).toBe(true);
    expect(existsSync(outputs.qualityCsvPath)).toBe(true);
    expect(existsSync(outputs.manualReviewCsvPath)).toBe(true);
    expect(existsSync(outputs.reportMarkdownPath)).toBe(true);
    expect(existsSync(outputs.evidenceIndexPath)).toBe(true);

    const qualityCsv = readFileSync(outputs.qualityCsvPath, 'utf8');
    expect(qualityCsv).toContain('english_demo');
    expect(qualityCsv).toContain('0.25');

    const artifactCsv = readFileSync(outputs.artifactCsvPath, 'utf8');
    expect(artifactCsv).toContain('english_demo');
    expect(artifactCsv).toContain('yes');
    expect(artifactCsv).toContain('overlapping_segment_count');

    const policyCsv = readFileSync(outputs.policyCsvPath, 'utf8');
    expect(policyCsv).toContain('english_demo');
    expect(policyCsv).toContain('distil_whisper_en');
    expect(policyCsv).toContain('paraformer_zh');
    expect(policyCsv).toContain('after_asr');

    const casesCsv = readFileSync(outputs.casesCsvPath, 'utf8');
    expect(casesCsv).toContain('chinese_failedcase');
    expect(casesCsv).toContain('FAILED');
    expect(casesCsv).toContain('download_failed');

    const report = readFileSync(outputs.reportMarkdownPath, 'utf8');
    expect(report).toContain('progressive asynchronous subtitle generation');
    expect(report).toContain('observed via backend status polling');
    expect(report).toContain('not exact socket, Redis, MinIO, or client-perceived timestamps');
    expect(report).toContain('Polling interval recorded for this run: 1000 ms');
    expect(report).toContain('Translation Policy Summary');
    expect(report).toContain('Manual Translation Review Instructions');
  });
});

function timelineEntry(
  tSeconds: number,
  status: string,
  chunkCount: number,
  translatedBatchCount: number,
  progress: number,
  hasFinal: boolean,
) {
  return {
    tSeconds,
    at: '2026-06-11T00:00:00.000Z',
    status,
    progress,
    currentStep: null,
    estimatedTimeRemaining: null,
    sourceLanguage: status === 'FAILED' ? 'zh' : 'en',
    targetLanguage: 'vi',
    artifacts: {
      chunkCount,
      translatedBatchCount,
      hasFinal,
      latestChunkIndex: chunkCount > 0 ? chunkCount - 1 : null,
      latestBatchIndex: translatedBatchCount > 0 ? translatedBatchCount - 1 : null,
      finalObjectKey: hasFinal ? 'final.json' : null,
    },
  };
}

function mkdirp(path: string): void {
  const { mkdirSync } = require('node:fs') as typeof import('node:fs');
  mkdirSync(path, { recursive: true });
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(path: string, value: string): void {
  writeFileSync(path, value, 'utf8');
}
