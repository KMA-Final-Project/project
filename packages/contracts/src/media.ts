export type MediaStatus =
  | "QUEUED"
  | "VALIDATING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

export type MediaOriginType = "LOCAL" | "YOUTUBE";

export type MediaPipelineStage =
  | "AUDIO_PREP"
  | "INSPECTING"
  | "VAD"
  | "PROCESSING"
  | "TRANSLATING"
  | "EXPORTING";

export type MediaFailureCode =
  | "subscriptionInactive"
  | "quotaExceeded"
  | "durationLimitExceeded"
  | "validationFailed"
  | "processingFailed";

export interface MediaArtifactsSummary {
  chunkCount: number;
  translatedBatchCount: number;
  hasFinal: boolean;
  latestChunkIndex: number | null;
  latestBatchIndex: number | null;
  finalObjectKey: string | null;
}

export interface MediaChunkArtifact {
  chunkIndex: number;
  objectKey: string;
  url: string;
  size: number;
  lastModified: string | null;
}

export interface MediaTranslatedBatchArtifact {
  batchIndex: number;
  objectKey: string;
  url: string;
  size: number;
  lastModified: string | null;
}

export interface MediaFinalArtifact {
  objectKey: string;
  url: string;
  size: number;
  lastModified: string | null;
}

export interface MediaItem {
  id: string;
  title: string | null;
  status: MediaStatus;
  progress: number | null;
  originType: MediaOriginType;
  originUrl?: string | null;
  durationSeconds: number | null;
  currentStep: MediaPipelineStage | null;
  createdAt: string;
  estimatedTimeRemaining?: number | null;
  failCode?: MediaFailureCode | null;
  failReason?: string | null;
  sourceLanguage?: string | null;
  targetLanguage?: string | null;
  transcriptS3Key?: string | null;
  subtitleS3Key?: string | null;
  artifacts?: MediaArtifactsSummary;
  languageCount?: number;
  thumbnailUrl?: string | null;
  youtubeVideoId?: string | null;
  hasThumbnail?: boolean;
  updatedAt?: string;
}

export interface PresignedUrlRequest {
  fileName: string;
  mimeType: string;
  fileSize: number;
}

export interface PresignedUrlResponse {
  uploadUrl: string;
  objectKey: string;
  expiresIn: number;
  mediaId: string;
  thumbnailUploadUrl?: string;
}

export interface ConfirmUploadRequest {
  title: string;
  objectKey: string;
  targetLanguage?: string;
  mediaId?: string;
  hasThumbnail?: boolean;
}

export interface SubmitYouTubeRequest {
  url: string;
  title?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
}

export interface ConfirmUploadResponse {
  id: string;
  title: string;
  status: MediaStatus;
  jobId: string;
  targetLanguage?: string | null;
}

export interface SubmitYouTubeResponse {
  id: string;
  title: string;
  status: MediaStatus;
  originUrl: string | null;
  jobId: string;
  targetLanguage?: string | null;
}

export interface MediaStatusResponse extends MediaItem {
  estimatedTimeRemaining: number | null;
  failCode: MediaFailureCode | null;
  failReason: string | null;
  sourceLanguage: string | null;
  targetLanguage: string | null;
  transcriptS3Key: string | null;
  subtitleS3Key: string | null;
  artifacts: MediaArtifactsSummary;
}

export interface MediaArtifactsResponse {
  mediaId: string;
  status: MediaStatus;
  summary: MediaArtifactsSummary;
  chunks: MediaChunkArtifact[];
  translatedBatches: MediaTranslatedBatchArtifact[];
  final: MediaFinalArtifact | null;
}

export interface MediaDownloadUrlResponse {
  url: string;
}

export interface MediaStreamResponse {
  videoUrl: string | null;
  audioUrl: string;
  title: string;
  durationSeconds: number;
  originUrl: string;
  thumbnailUrl: string | null;
  expiresInSeconds: number;
}
