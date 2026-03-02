/**
 * Media Service — Kapter
 *
 * Axios wrappers for REST endpoints related to media.
 */
import { api } from "@/services/api";
import type {
  MediaItem,
  PresignedUrlRequest,
  PresignedUrlResponse,
  ConfirmUploadRequest,
  SubmitYouTubeRequest,
  MediaStatusResponse,
} from "@/types/media";

export const mediaService = {
  /**
   * Fetch all media items for the current user
   */
  async getLibrary(): Promise<MediaItem[]> {
    const res = await api.get<MediaItem[]>("/media");
    return res.data;
  },

  /**
   * Get realtime status of a specific processing media job
   */
  async getStatus(id: string): Promise<MediaStatusResponse> {
    const res = await api.get<MediaStatusResponse>(`/media/${id}/status`);
    return res.data;
  },

  /**
   * Request an S3/MinIO presigned URL to upload audio directly
   */
  async getPresignedUrl(
    data: PresignedUrlRequest,
  ): Promise<PresignedUrlResponse> {
    const res = await api.post<PresignedUrlResponse>(
      "/media/presigned-url",
      data,
    );
    return res.data;
  },

  /**
   * Confirm the local audio was successfully uploaded and trigger processing
   */
  async confirmUpload(data: ConfirmUploadRequest): Promise<MediaItem> {
    const res = await api.post<MediaItem>("/media/confirm-upload", data);
    return res.data;
  },

  /**
   * Submit a YouTube URL for downloading and processing
   */
  async submitYouTube(data: SubmitYouTubeRequest): Promise<MediaItem> {
    const res = await api.post<MediaItem>("/media/youtube", data);
    return res.data;
  },
};
