/**
 * Media Service — Kapter
 *
 * Axios wrappers for REST endpoints related to media.
 */
import { api } from "@/services/api";
import { ENDPOINTS } from "@/constants/endpoint";
import type {
  ConfirmUploadResponse,
  MediaArtifactsResponse,
  MediaItem,
  PresignedUrlRequest,
  PresignedUrlResponse,
  ConfirmUploadRequest,
  SubmitYouTubeRequest,
  MediaStatusResponse,
  SubmitYouTubeResponse,
} from "@/types/media";

export const mediaService = {
  /** Fetch all media items for the current user */
  async getLibrary(): Promise<MediaItem[]> {
    const res = await api.get<MediaItem[]>(ENDPOINTS.MEDIA_LIST);
    return res.data;
  },

  /** Get realtime status of a specific processing media job */
  async getStatus(id: string): Promise<MediaStatusResponse> {
    const res = await api.get<MediaStatusResponse>(ENDPOINTS.MEDIA_STATUS(id));
    return res.data;
  },

  /** Get durable chunk, batch, and final artifact inventory for resume-safe UI */
  async getArtifacts(id: string): Promise<MediaArtifactsResponse> {
    const res = await api.get<MediaArtifactsResponse>(
      ENDPOINTS.MEDIA_ARTIFACTS(id),
    );
    return res.data;
  },

  /** Request a presigned PUT URL to upload audio directly to MinIO */
  async getPresignedUrl(
    data: PresignedUrlRequest,
  ): Promise<PresignedUrlResponse> {
    const res = await api.post<PresignedUrlResponse>(
      ENDPOINTS.MEDIA_PRESIGNED_URL,
      data,
    );
    return res.data;
  },

  /** Confirm the audio was uploaded and trigger background processing */
  async confirmUpload(
    data: ConfirmUploadRequest,
  ): Promise<ConfirmUploadResponse> {
    const res = await api.post<ConfirmUploadResponse>(
      ENDPOINTS.MEDIA_CONFIRM_UPLOAD,
      data,
    );
    return res.data;
  },

  /** Submit a YouTube URL for downloading and processing */
  async submitYouTube(
    data: SubmitYouTubeRequest,
  ): Promise<SubmitYouTubeResponse> {
    const res = await api.post<SubmitYouTubeResponse>(
      ENDPOINTS.MEDIA_SUBMIT_YOUTUBE,
      data,
    );
    return res.data;
  },
};
