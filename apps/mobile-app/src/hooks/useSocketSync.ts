import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { socketService } from "@/services/socket.service";
import { useAuthStore } from "@/stores/auth.store";
import { mediaKeys } from "./useMedia";
import type { MediaItem } from "@/types/media";

/** Minimum interval (ms) between progress cache-writes per media item. */
const PROGRESS_THROTTLE_MS = 1500;

/**
 * Global hook to manage Socket.io connection and sync to React Query.
 * Should be mounted once near the root of the app (e.g. _layout.tsx).
 *
 * Handles five discrete events emitted by the backend:
 *   media_progress     → throttled cache patch (status, progress, step)
 *   media_chunk_ready   → append chunk metadata to media-chunks cache
 *   media_batch_ready   → append batch metadata to media-batches cache + update progress
 *   media_completed     → set COMPLETED, invalidate library (instant, bypasses throttle)
 *   media_failed        → set FAILED (instant, bypasses throttle)
 */
export function useSocketSync() {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Track last progress-write timestamp per mediaId (imperative, no re-renders)
  const lastProgressWrite = useRef<Record<string, number>>({});

  // ─── Helpers ──────────────────────────────────────────────────

  /** Patch a single field-set into the status cache for a given mediaId. */
  const patchStatus = useCallback(
    (mediaId: string, patch: Partial<MediaItem>) => {
      queryClient.setQueryData(
        mediaKeys.status(mediaId),
        (old: MediaItem | undefined) => (old ? { ...old, ...patch } : old),
      );
    },
    [queryClient],
  );

  /** Patch the same fields into the library list cache. */
  const patchList = useCallback(
    (mediaId: string, patch: Partial<MediaItem>) => {
      queryClient.setQueryData(
        mediaKeys.all,
        (oldData: MediaItem[] | undefined) => {
          if (!oldData || !Array.isArray(oldData)) return oldData;
          return oldData.map((item) =>
            item.id === mediaId ? { ...item, ...patch } : item,
          );
        },
      );
    },
    [queryClient],
  );

  // ─── Connection lifecycle ────────────────────────────────────

  useEffect(() => {
    if (isAuthenticated) {
      socketService.connect();
    } else {
      socketService.disconnect();
    }
    return () => {
      socketService.disconnect();
    };
  }, [isAuthenticated]);

  // ─── Event subscriptions ─────────────────────────────────────

  useEffect(() => {
    // 1. media_progress — throttled
    const unsubProgress = socketService.onProgress((event) => {
      const now = Date.now();
      const last = lastProgressWrite.current[event.mediaId] ?? 0;
      if (now - last < PROGRESS_THROTTLE_MS) return; // skip
      lastProgressWrite.current[event.mediaId] = now;

      const patch: Partial<MediaItem> = {
        status: "PROCESSING",
        progress: event.progress,
        currentStep: event.currentStep,
        estimatedTimeRemaining: event.estimatedTimeRemaining,
      };
      patchStatus(event.mediaId, patch);
      patchList(event.mediaId, patch);
    });

    // 2. media_chunk_ready — append to chunks cache
    const unsubChunk = socketService.onChunkReady((event) => {
      queryClient.setQueryData(
        mediaKeys.chunks(event.mediaId),
        (
          old:
            | { chunkIndex: number; url: string; sentenceCount: number }[]
            | undefined,
        ) => {
          const entry = {
            chunkIndex: event.chunkIndex,
            url: event.url,
            sentenceCount: event.sentenceCount,
          };
          return old ? [...old, entry] : [entry];
        },
      );
    });

    // 3. media_batch_ready — append to batches cache + update progress
    const unsubBatch = socketService.onBatchReady((event) => {
      queryClient.setQueryData(
        mediaKeys.batches(event.mediaId),
        (
          old:
            | { batchIndex: number; url: string; segmentCount: number }[]
            | undefined,
        ) => {
          const entry = {
            batchIndex: event.batchIndex,
            url: event.url,
            segmentCount: event.segmentCount,
          };
          return old ? [...old, entry] : [entry];
        },
      );

      // Also update progress (batch events carry progress)
      const patch: Partial<MediaItem> = {
        status: "PROCESSING",
        progress: event.progress,
      };
      patchStatus(event.mediaId, patch);
      patchList(event.mediaId, patch);
    });

    // 4. media_completed — instant, bypasses throttle
    const unsubCompleted = socketService.onCompleted((event) => {
      delete lastProgressWrite.current[event.mediaId];

      const patch: Partial<MediaItem> = {
        status: "COMPLETED",
        progress: 1,
        currentStep: null,
        estimatedTimeRemaining: null,
        sourceLanguage: event.sourceLanguage,
        transcriptS3Key: event.transcriptS3Key,
      };
      patchStatus(event.mediaId, patch);
      patchList(event.mediaId, patch);

      // Background refetch for any additional server fields
      queryClient.invalidateQueries({ queryKey: mediaKeys.all });
      queryClient.invalidateQueries({
        queryKey: mediaKeys.status(event.mediaId),
      });
    });

    // 5. media_failed — instant, bypasses throttle
    const unsubFailed = socketService.onFailed((event) => {
      delete lastProgressWrite.current[event.mediaId];

      const patch: Partial<MediaItem> = {
        status: "FAILED",
        progress: null,
        currentStep: null,
        estimatedTimeRemaining: null,
        failReason: event.reason,
      };
      patchStatus(event.mediaId, patch);
      patchList(event.mediaId, patch);
    });

    return () => {
      unsubProgress();
      unsubChunk();
      unsubBatch();
      unsubCompleted();
      unsubFailed();
    };
  }, [queryClient, patchStatus, patchList]);
}
