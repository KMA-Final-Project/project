/**
 * Typed Redis event payloads for the media_updates channel.
 *
 * These match the events published by the AI Engine and are forwarded
 * to Socket.IO only after an explicit runtime shape check.
 */

export interface MediaProgressEvent {
  type: 'progress';
  mediaId: string;
  userId: string;
  progress: number;
  currentStep: string;
  estimatedTimeRemaining: number | null;
}

export interface MediaChunkReadyEvent {
  type: 'chunk_ready';
  mediaId: string;
  userId: string;
  chunkIndex: number;
  url: string;
  sentenceCount: number;
}

export interface MediaBatchReadyEvent {
  type: 'batch_ready';
  mediaId: string;
  userId: string;
  batchIndex: number;
  url: string;
  segmentCount: number;
  progress: number;
}

export interface MediaCompletedEvent {
  type: 'completed';
  mediaId: string;
  userId: string;
  finalUrl: string;
  segmentCount: number;
  sourceLanguage: string;
  targetLanguage: string;
  transcriptS3Key: string;
}

export interface MediaFailedEvent {
  type: 'failed';
  mediaId: string;
  userId: string;
  reason: string;
}

export type MediaEvent =
  | MediaProgressEvent
  | MediaChunkReadyEvent
  | MediaBatchReadyEvent
  | MediaCompletedEvent
  | MediaFailedEvent;

export const MEDIA_SOCKET_EVENT_BY_TYPE = {
  progress: 'media_progress',
  chunk_ready: 'media_chunk_ready',
  batch_ready: 'media_batch_ready',
  completed: 'media_completed',
  failed: 'media_failed',
} as const;

export type MediaSocketEventName =
  (typeof MEDIA_SOCKET_EVENT_BY_TYPE)[keyof typeof MEDIA_SOCKET_EVENT_BY_TYPE];

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || isNumber(value);
}

function hasBaseFields(value: UnknownRecord): value is UnknownRecord & {
  mediaId: string;
  userId: string;
} {
  return isString(value.mediaId) && isString(value.userId);
}

export function parseMediaEvent(payload: unknown): MediaEvent | null {
  if (
    !isRecord(payload) ||
    !isString(payload.type) ||
    !hasBaseFields(payload)
  ) {
    return null;
  }

  switch (payload.type) {
    case 'progress':
      if (
        isNumber(payload.progress) &&
        isString(payload.currentStep) &&
        isNullableNumber(payload.estimatedTimeRemaining)
      ) {
        return {
          type: 'progress',
          mediaId: payload.mediaId,
          userId: payload.userId,
          progress: payload.progress,
          currentStep: payload.currentStep,
          estimatedTimeRemaining: payload.estimatedTimeRemaining,
        };
      }
      return null;

    case 'chunk_ready':
      if (
        isNumber(payload.chunkIndex) &&
        isString(payload.url) &&
        isNumber(payload.sentenceCount)
      ) {
        return {
          type: 'chunk_ready',
          mediaId: payload.mediaId,
          userId: payload.userId,
          chunkIndex: payload.chunkIndex,
          url: payload.url,
          sentenceCount: payload.sentenceCount,
        };
      }
      return null;

    case 'batch_ready':
      if (
        isNumber(payload.batchIndex) &&
        isString(payload.url) &&
        isNumber(payload.segmentCount) &&
        isNumber(payload.progress)
      ) {
        return {
          type: 'batch_ready',
          mediaId: payload.mediaId,
          userId: payload.userId,
          batchIndex: payload.batchIndex,
          url: payload.url,
          segmentCount: payload.segmentCount,
          progress: payload.progress,
        };
      }
      return null;

    case 'completed':
      if (
        isString(payload.finalUrl) &&
        isNumber(payload.segmentCount) &&
        isString(payload.sourceLanguage) &&
        isString(payload.targetLanguage) &&
        isString(payload.transcriptS3Key)
      ) {
        return {
          type: 'completed',
          mediaId: payload.mediaId,
          userId: payload.userId,
          finalUrl: payload.finalUrl,
          segmentCount: payload.segmentCount,
          sourceLanguage: payload.sourceLanguage,
          targetLanguage: payload.targetLanguage,
          transcriptS3Key: payload.transcriptS3Key,
        };
      }
      return null;

    case 'failed':
      if (isString(payload.reason)) {
        return {
          type: 'failed',
          mediaId: payload.mediaId,
          userId: payload.userId,
          reason: payload.reason,
        };
      }
      return null;

    default:
      return null;
  }
}

export function getSocketEventName(event: MediaEvent): MediaSocketEventName {
  return MEDIA_SOCKET_EVENT_BY_TYPE[event.type];
}

function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = '?<redacted>';
    return parsed.toString();
  } catch {
    return url;
  }
}

export function redactMediaPayload(payload: unknown): unknown {
  if (!isRecord(payload)) {
    return payload;
  }

  const redacted: UnknownRecord = {};
  for (const [key, value] of Object.entries(payload)) {
    if (
      typeof value === 'string' &&
      (key.toLowerCase() === 'url' || key.toLowerCase().endsWith('url'))
    ) {
      redacted[key] = redactUrl(value);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}
