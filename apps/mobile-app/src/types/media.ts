/**
 * Media Types — Kapter
 *
 * TypeScript interfaces mirroring the backend Prisma models and API DTOs.
 */

export type MediaStatus =
  | "QUEUED"
  | "VALIDATING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

export type MediaOriginType = "LOCAL" | "YOUTUBE";

export type ProcessingMode = "TRANSCRIBE" | "TRANSCRIBE_TRANSLATE";

export interface MediaItem {
  id: string;
  title: string | null;
  originType: MediaOriginType;
  status: MediaStatus;
  processingMode: ProcessingMode;
  progress: number | null; // 0.0 - 1.0
  currentStep: string | null; // e.g. 'TRANSCRIBING', null when idle/completed
  estimatedTimeRemaining: number | null; // seconds, null when idle/completed
  failReason: string | null;
  durationSeconds: number | null;
  sourceLanguage: string | null;
  languageCount?: number; // Added for subtitle string
  transcriptS3Key: string | null;
  subtitleS3Key: string | null;
  audioS3Key: string | null;
  thumbnailUrl?: string | null; // Added for thumbnail support
  createdAt: string; // ISO date string
  updatedAt: string;
}

// ─── API Request / Response shapes ──────────────────────────────

export interface PresignedUrlRequest {
  fileName: string;
  mimeType: string;
  /** Backend field name is `fileSize` (not fileSizeBytes) */
  fileSize: number;
}

export interface PresignedUrlResponse {
  uploadUrl: string;
  objectKey: string;
  expiresIn: string;
}

export interface ConfirmUploadRequest {
  /** User-visible title (worker auto-extracts if omitted for YouTube) */
  title: string;
  /** S3 object key returned from presigned-url step */
  objectKey: string;
  processingMode?: ProcessingMode;
  /** Target language for translation (e.g. "vi", "en") */
  targetLanguage?: string;
}

export interface SubmitYouTubeRequest {
  url: string;
  /** Optional title — worker auto-extracts via yt-dlp if omitted */
  title?: string;
  processingMode?: ProcessingMode;
  /** Target language for translation (e.g. "vi", "en") */
  targetLanguage?: string;
}

export interface MediaStatusResponse {
  id: string;
  title: string | null;
  status: MediaStatus;
  progress: number | null;
  processingMode: ProcessingMode;
  sourceLanguage: string | null;
  durationSeconds: number | null;
  originType: MediaOriginType;
  currentStep: string | null;
  estimatedTimeRemaining: number | null; // seconds
  failReason: string | null;
  transcriptS3Key: string | null;
  subtitleS3Key: string | null;
  createdAt: string;
}
