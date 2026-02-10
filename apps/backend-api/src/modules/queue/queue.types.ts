import { MediaOriginType } from 'prisma/generated/client';

/**
 * Standardized job payload dispatched to the transcription queue.
 * The (future) Python Worker will consume jobs matching this structure.
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
}

/** Queue name constant — shared between producer and (future) consumer */
export const TRANSCRIPTION_QUEUE = 'transcription';
