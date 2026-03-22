/**
 * Socket Event Types — Kapter
 *
 * TypeScript interfaces mirroring the backend socket.types.ts event payloads.
 * These are the events emitted by the SocketService via Redis Pub/Sub → Socket.IO.
 */

export interface MediaProgressEvent {
  type: "progress";
  mediaId: string;
  userId: string;
  progress: number;
  currentStep: string;
  estimatedTimeRemaining: number | null;
}

export interface MediaChunkReadyEvent {
  type: "chunk_ready";
  mediaId: string;
  userId: string;
  chunkIndex: number;
  url: string;
  sentenceCount: number;
}

export interface MediaBatchReadyEvent {
  type: "batch_ready";
  mediaId: string;
  userId: string;
  batchIndex: number;
  url: string;
  segmentCount: number;
  progress: number;
}

export interface MediaCompletedEvent {
  type: "completed";
  mediaId: string;
  userId: string;
  finalUrl: string;
  segmentCount: number;
  sourceLanguage: string;
  targetLanguage: string;
  transcriptS3Key: string;
}

export interface MediaFailedEvent {
  type: "failed";
  mediaId: string;
  userId: string;
  reason: string;
}

export type MediaSocketEvent =
  | MediaProgressEvent
  | MediaChunkReadyEvent
  | MediaBatchReadyEvent
  | MediaCompletedEvent
  | MediaFailedEvent;
