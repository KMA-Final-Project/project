import { MediaOriginType } from 'prisma/generated/client';

// ==================== Queue Names ====================

/** Queue consumed by the NestJS Worker (validation, download, quota checks) */
export const TRANSCRIPTION_QUEUE = 'transcription';

/** Queue consumed by the Python AI Engine (GPU processing) */
export const AI_PROCESSING_QUEUE = 'ai-processing';

// ==================== Job Payloads ====================

/**
 * Payload dispatched by the API → consumed by the NestJS Worker.
 * The Worker validates, downloads, and re-checks quota before dispatching to AI.
 */
export interface TranscriptionJobPayload {
  /** Database ID of the MediaItem record */
  mediaId: string;

  /** Origin type determines the worker's ingestion strategy */
  type: MediaOriginType;

  /** S3 object key — present for LOCAL uploads */
  filePath?: string;

  /** YouTube URL — present for YOUTUBE submissions */
  url?: string;

  /** User who submitted the media (for quota tracking in worker) */
  userId: string;

  /** Processing mode selected by the user */
  processingMode: 'TRANSCRIBE' | 'TRANSCRIBE_TRANSLATE';

  /** Target language for translation (defaults to 'vi' if omitted) */
  targetLanguage?: string;
}

/**
 * Payload dispatched by the NestJS Worker → consumed by the Python AI Engine.
 * Only created AFTER validation passes (duration check, quota check, format check).
 */
export interface AiProcessingJobPayload {
  /** Database ID of the MediaItem record */
  mediaId: string;

  /** Validated audio file location in MinIO (raw bucket) */
  audioS3Key: string;

  /** Processing mode: transcribe only or full bilingual pipeline */
  processingMode: 'TRANSCRIBE' | 'TRANSCRIBE_TRANSLATE';

  /** Verified audio duration in seconds */
  durationSeconds: number;

  /** User who submitted the media */
  userId: string;

  /** Target language for translation (defaults to 'vi' if omitted) */
  targetLanguage?: string;
}
