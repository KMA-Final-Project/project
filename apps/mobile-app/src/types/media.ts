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
  progress: number | null; // 0–100
  failReason: string | null;
  durationSeconds: number | null;
  sourceLanguage: string | null;
  subtitleS3Key: string | null;
  audioS3Key: string | null;
  createdAt: string; // ISO date string
  updatedAt: string;
}

// ─── API Request / Response shapes ──────────────────────────────

export interface PresignedUrlRequest {
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
}

export interface PresignedUrlResponse {
  uploadUrl: string;
  s3Key: string;
  expiresAt: string;
}

export interface ConfirmUploadRequest {
  s3Key: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
}

export interface SubmitYouTubeRequest {
  url: string;
}

export interface MediaStatusResponse {
  id: string;
  status: MediaStatus;
  progress: number | null;
  failReason: string | null;
}
