/**
 * useMedia — Kapter
 *
 * TanStack Query hooks for all media-related operations.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { mediaService } from "@/services/media.services";
import type {
  ConfirmUploadResponse,
  MediaItem,
  MediaOriginType,
  SubmitYouTubeResponse,
} from "@/types/media";

function upsertLibraryItem(
  queryClient: ReturnType<typeof useQueryClient>,
  item: MediaItem,
) {
  queryClient.setQueryData(
    mediaKeys.all,
    (oldData: MediaItem[] | undefined) => {
      if (!oldData) return [item];
      return [item, ...oldData.filter((entry) => entry.id !== item.id)];
    },
  );
}

function buildQueuedMediaItem(
  response: ConfirmUploadResponse | SubmitYouTubeResponse,
  originType: MediaOriginType,
  originUrl: string | null = null,
): MediaItem {
  return {
    id: response.id,
    title: response.title,
    status: response.status,
    progress: 0,
    originType,
    originUrl,
    durationSeconds: null,
    currentStep: null,
    createdAt: new Date().toISOString(),
    estimatedTimeRemaining: null,
    failReason: null,
    sourceLanguage: null,
    transcriptS3Key: null,
    subtitleS3Key: null,
  };
}

// ─── Query Keys ──────────────────────────────────────────────────

export const mediaKeys = {
  all: ["media"] as const,
  status: (id: string) => ["media-status", id] as const,
  artifacts: (id: string) => ["media-artifacts", id] as const,
};

const socketFirstQueryOptions = {
  staleTime: Infinity,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const;

// ─── Queries ─────────────────────────────────────────────────────

/**
 * Fetches the current user's media library.
 * Used on the home/library screen.
 */
export function useMediaList() {
  return useQuery({
    queryKey: mediaKeys.all,
    queryFn: () => mediaService.getLibrary(),
  });
}

/**
 * Fetches status for a single media item via REST ONCE.
 * Subsequence updates are automatically handled and cache-invalidated
 * by Socket.io global listener inside useSocketSync.
 */
export function useMediaStatus(id: string | null) {
  return useQuery({
    queryKey: mediaKeys.status(id ?? ""),
    queryFn: () => mediaService.getStatus(id!),
    enabled: !!id,
    ...socketFirstQueryOptions,
  });
}

export function useMediaArtifacts(id: string | null) {
  return useQuery({
    queryKey: mediaKeys.artifacts(id ?? ""),
    queryFn: () => mediaService.getArtifacts(id!),
    enabled: !!id,
    ...socketFirstQueryOptions,
  });
}

// ─── Mutations ────────────────────────────────────────────────────

/**
 * Submits a YouTube URL for download and bilingual processing.
 * On success: adds item optimistically to local store + invalidates library.
 */
export function useSubmitYouTube() {
  const queryClient = useQueryClient();
  const { i18n } = useTranslation();

  return useMutation({
    mutationFn: (url: string) =>
      mediaService.submitYouTube({
        url,
        targetLanguage: i18n.language,
      }),
    onSuccess: (response) => {
      const queuedItem = buildQueuedMediaItem(
        response,
        "YOUTUBE",
        response.originUrl,
      );
      upsertLibraryItem(queryClient, queuedItem);
      queryClient.setQueryData(mediaKeys.status(response.id), queuedItem);
      queryClient.invalidateQueries({ queryKey: mediaKeys.all });
    },
  });
}

/**
 * Upload a local audio file:
 *   1. Request presigned PUT URL from backend
 *   2. PUT file blob directly to MinIO
 *   3. Confirm upload → triggers NestJS Worker + AI processing pipeline
 */
export function useUploadMedia() {
  const queryClient = useQueryClient();
  const { i18n } = useTranslation();

  return useMutation({
    mutationFn: async (file: {
      uri: string;
      name: string;
      mimeType: string;
      size: number;
    }) => {
      // Step 1 — Get presigned URL
      const { uploadUrl, objectKey } = await mediaService.getPresignedUrl({
        fileName: file.name,
        mimeType: file.mimeType,
        fileSize: file.size,
      });

      // Step 2 — Upload file blob directly to MinIO (bypasses our API server)
      const fileResponse = await fetch(file.uri);
      const fileBlob = await fileResponse.blob();
      await fetch(uploadUrl, {
        method: "PUT",
        body: fileBlob,
        headers: { "Content-Type": file.mimeType },
      });

      // Step 3 — Confirm upload → creates MediaItem + dispatches queue job
      const title = file.name.replace(/\.[^.]+$/, ""); // strip file extension for title
      return mediaService.confirmUpload({
        title,
        objectKey: objectKey,
        targetLanguage: i18n.language,
      });
    },
    onSuccess: (response) => {
      const queuedItem = buildQueuedMediaItem(response, "LOCAL");
      upsertLibraryItem(queryClient, queuedItem);
      queryClient.setQueryData(mediaKeys.status(response.id), queuedItem);
      queryClient.invalidateQueries({ queryKey: mediaKeys.all });
    },
  });
}
