/**
 * Typed Redis event payloads for the media_updates channel.
 *
 * These match the events published by the AI Engine and are forwarded
 * as-is by the SocketService to the appropriate Socket.IO room.
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
