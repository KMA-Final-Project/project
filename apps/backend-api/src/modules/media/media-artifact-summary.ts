import type { ProcessedArtifactSummary } from 'src/modules/minio/minio.service';
import { Prisma } from 'prisma/generated/client';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function toNonNegativeInteger(value: unknown, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.trunc(value));
}

function toNullableNonNegativeInteger(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.trunc(value));
}

function toNullableString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function maxNullable(current: number | null, incoming: number): number {
  return current === null ? incoming : Math.max(current, incoming);
}

export function createEmptyArtifactSummary(): ProcessedArtifactSummary {
  return {
    chunkCount: 0,
    translatedBatchCount: 0,
    hasFinal: false,
    latestChunkIndex: null,
    latestBatchIndex: null,
    finalObjectKey: null,
  };
}

export function normalizeArtifactSummary(
  value: unknown,
): ProcessedArtifactSummary {
  if (!isRecord(value)) {
    return createEmptyArtifactSummary();
  }

  const latestChunkIndex = toNullableNonNegativeInteger(value.latestChunkIndex);
  const latestBatchIndex = toNullableNonNegativeInteger(value.latestBatchIndex);
  const finalObjectKey = toNullableString(value.finalObjectKey);

  const chunkCount = Math.max(
    toNonNegativeInteger(value.chunkCount),
    latestChunkIndex === null ? 0 : latestChunkIndex + 1,
  );
  const translatedBatchCount = Math.max(
    toNonNegativeInteger(value.translatedBatchCount),
    latestBatchIndex === null ? 0 : latestBatchIndex + 1,
  );

  return {
    chunkCount,
    translatedBatchCount,
    hasFinal:
      value.hasFinal === true ||
      (finalObjectKey !== null && finalObjectKey !== ''),
    latestChunkIndex,
    latestBatchIndex,
    finalObjectKey,
  };
}

export function mergeChunkArtifactSummary(
  current: unknown,
  chunkIndex: number,
): ProcessedArtifactSummary {
  const normalized = normalizeArtifactSummary(current);
  const safeChunkIndex = Math.max(0, Math.trunc(chunkIndex));

  return {
    ...normalized,
    chunkCount: Math.max(normalized.chunkCount, safeChunkIndex + 1),
    latestChunkIndex: maxNullable(normalized.latestChunkIndex, safeChunkIndex),
  };
}

export function mergeBatchArtifactSummary(
  current: unknown,
  batchIndex: number,
): ProcessedArtifactSummary {
  const normalized = normalizeArtifactSummary(current);
  const safeBatchIndex = Math.max(0, Math.trunc(batchIndex));

  return {
    ...normalized,
    translatedBatchCount: Math.max(
      normalized.translatedBatchCount,
      safeBatchIndex + 1,
    ),
    latestBatchIndex: maxNullable(normalized.latestBatchIndex, safeBatchIndex),
  };
}

export function mergeFinalArtifactSummary(
  current: unknown,
  finalObjectKey: string,
): ProcessedArtifactSummary {
  const normalized = normalizeArtifactSummary(current);

  return {
    ...normalized,
    hasFinal: true,
    finalObjectKey,
  };
}

export function artifactSummariesEqual(
  left: ProcessedArtifactSummary,
  right: ProcessedArtifactSummary,
): boolean {
  return (
    left.chunkCount === right.chunkCount &&
    left.translatedBatchCount === right.translatedBatchCount &&
    left.hasFinal === right.hasFinal &&
    left.latestChunkIndex === right.latestChunkIndex &&
    left.latestBatchIndex === right.latestBatchIndex &&
    left.finalObjectKey === right.finalObjectKey
  );
}

export function toArtifactSummaryJson(
  summary: ProcessedArtifactSummary,
): Prisma.InputJsonObject {
  return {
    chunkCount: summary.chunkCount,
    translatedBatchCount: summary.translatedBatchCount,
    hasFinal: summary.hasFinal,
    latestChunkIndex: summary.latestChunkIndex,
    latestBatchIndex: summary.latestBatchIndex,
    finalObjectKey: summary.finalObjectKey,
  };
}
