/**
 * useMedia — Kapter
 *
 * TanStack Query hooks for all media-related operations.
 * processingMode is always TRANSCRIBE_TRANSLATE (full bilingual subtitle generation).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { mediaService } from "@/services/media";
import { useMediaStore } from "@/stores/media.store";
import type { MediaStatus } from "@/types/media";

/** Active statuses that require polling */
const POLLING_STATUSES: MediaStatus[] = ["QUEUED", "VALIDATING", "PROCESSING"];

// ─── Query Keys ──────────────────────────────────────────────────

export const mediaKeys = {
  all: ["media"] as const,
  status: (id: string) => ["media-status", id] as const,
};

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
 * Polls processing status for a single media item.
 * Automatically stops polling when the item reaches a terminal state.
 */
export function useMediaStatus(id: string | null) {
  return useQuery({
    queryKey: mediaKeys.status(id ?? ""),
    queryFn: () => mediaService.getStatus(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && POLLING_STATUSES.includes(status) ? 3000 : false;
    },
  });
}

// ─── Mutations ────────────────────────────────────────────────────

/**
 * Submits a YouTube URL for download and bilingual processing.
 * On success: adds item optimistically to local store + invalidates library.
 */
export function useSubmitYouTube() {
  const queryClient = useQueryClient();
  const addItemLocally = useMediaStore((s) => s.addItemLocally);

  return useMutation({
    mutationFn: (url: string) =>
      mediaService.submitYouTube({
        url,
        processingMode: "TRANSCRIBE_TRANSLATE",
      }),
    onSuccess: (newItem) => {
      addItemLocally(newItem);
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
  const addItemLocally = useMediaStore((s) => s.addItemLocally);

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
        processingMode: "TRANSCRIBE_TRANSLATE",
      });
    },
    onSuccess: (newItem) => {
      addItemLocally(newItem);
      queryClient.invalidateQueries({ queryKey: mediaKeys.all });
    },
  });
}
