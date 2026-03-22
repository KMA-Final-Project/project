import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { socketService } from "@/services/socket.service";
import { useAuthStore } from "@/stores/auth.store";
import { mediaKeys } from "./useMedia";
import type {
  MediaArtifactsResponse,
  MediaItem,
  MediaPipelineStage,
  MediaStatus,
  MediaStatusResponse,
} from "@/types/media";

/** Minimum interval (ms) between progress cache-writes per media item. */
const PROGRESS_THROTTLE_MS = 1500;

const PIPELINE_STAGE_ORDER: Record<MediaPipelineStage, number> = {
  AUDIO_PREP: 0,
  INSPECTING: 1,
  VAD: 2,
  PROCESSING: 3,
  TRANSLATING: 4,
  EXPORTING: 5,
};

function isFiniteProgress(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function mergeLivePatch<
  T extends {
    status: MediaStatus;
    progress: number | null;
    currentStep?: MediaPipelineStage | null;
    estimatedTimeRemaining?: number | null;
  },
>(current: T, patch: Partial<T>): T {
  const next = { ...current, ...patch };

  if (patch.status !== "PROCESSING") {
    return next;
  }

  const currentProgress = isFiniteProgress(current.progress)
    ? current.progress
    : null;
  const incomingProgress = isFiniteProgress(patch.progress)
    ? patch.progress
    : null;

  if (
    currentProgress !== null &&
    incomingProgress !== null &&
    incomingProgress < currentProgress
  ) {
    next.progress = currentProgress;
  }

  const currentStep = current.currentStep ?? null;
  const incomingStep = patch.currentStep ?? null;

  if (
    currentStep &&
    incomingStep &&
    PIPELINE_STAGE_ORDER[incomingStep] < PIPELINE_STAGE_ORDER[currentStep]
  ) {
    next.currentStep = currentStep;
  }

  if (
    current.estimatedTimeRemaining !== undefined &&
    next.progress === currentProgress &&
    next.currentStep === currentStep
  ) {
    next.estimatedTimeRemaining = current.estimatedTimeRemaining;
  }

  return next;
}

function createEmptyArtifacts(
  mediaId: string,
  status: MediaStatus,
): MediaArtifactsResponse {
  return {
    mediaId,
    status,
    summary: {
      chunkCount: 0,
      translatedBatchCount: 0,
      hasFinal: false,
      latestChunkIndex: null,
      latestBatchIndex: null,
      finalObjectKey: null,
    },
    chunks: [],
    translatedBatches: [],
    final: null,
  };
}

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
  const hasConnectedOnce = useRef(false);

  // ─── Helpers ──────────────────────────────────────────────────

  /** Patch a single field-set into the status cache for a given mediaId. */
  const patchStatus = useCallback(
    (mediaId: string, patch: Partial<MediaStatusResponse>) => {
      queryClient.setQueryData(
        mediaKeys.status(mediaId),
        (old: MediaStatusResponse | undefined) =>
          old ? mergeLivePatch(old, patch) : old,
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
            item.id === mediaId ? mergeLivePatch(item, patch) : item,
          );
        },
      );
    },
    [queryClient],
  );

  const patchArtifacts = useCallback(
    (
      mediaId: string,
      updater: (
        old: MediaArtifactsResponse | undefined,
      ) => MediaArtifactsResponse,
    ) => {
      queryClient.setQueryData(
        mediaKeys.artifacts(mediaId),
        (old: MediaArtifactsResponse | undefined) => updater(old),
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

  useEffect(() => {
    const unsubscribeConnect = socketService.onConnect(() => {
      if (!hasConnectedOnce.current) {
        hasConnectedOnce.current = true;
        return;
      }

      void queryClient.invalidateQueries({ queryKey: mediaKeys.all });
      void queryClient.invalidateQueries({ queryKey: ["media-status"] });
      void queryClient.invalidateQueries({ queryKey: ["media-artifacts"] });
    });

    const unsubscribeDisconnect = socketService.onDisconnect(() => {
      lastProgressWrite.current = {};
    });

    return () => {
      unsubscribeConnect();
      unsubscribeDisconnect();
    };
  }, [queryClient]);

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
        currentStep: event.currentStep as MediaPipelineStage,
        estimatedTimeRemaining: event.estimatedTimeRemaining,
      };
      patchStatus(event.mediaId, patch);
      patchList(event.mediaId, patch);
    });

    // 2. media_chunk_ready — append to chunks cache
    const unsubChunk = socketService.onChunkReady((event) => {
      patchArtifacts(event.mediaId, (old) => {
        const next = old ?? createEmptyArtifacts(event.mediaId, "PROCESSING");
        if (
          next.chunks.some((chunk) => chunk.chunkIndex === event.chunkIndex)
        ) {
          return next;
        }

        const chunks = [
          ...next.chunks,
          {
            chunkIndex: event.chunkIndex,
            objectKey: `${event.mediaId}/chunks/${event.chunkIndex}.json`,
            url: event.url,
            size: 0,
            lastModified: null,
          },
        ].sort((left, right) => left.chunkIndex - right.chunkIndex);

        return {
          ...next,
          status: "PROCESSING",
          chunks,
          summary: {
            ...next.summary,
            chunkCount: Math.max(next.summary.chunkCount, chunks.length),
            latestChunkIndex: chunks[chunks.length - 1]?.chunkIndex ?? null,
          },
        };
      });
    });

    // 3. media_batch_ready — append to batches cache + update progress
    const unsubBatch = socketService.onBatchReady((event) => {
      patchArtifacts(event.mediaId, (old) => {
        const next = old ?? createEmptyArtifacts(event.mediaId, "PROCESSING");
        if (
          next.translatedBatches.some(
            (batch) => batch.batchIndex === event.batchIndex,
          )
        ) {
          return next;
        }

        const translatedBatches = [
          ...next.translatedBatches,
          {
            batchIndex: event.batchIndex,
            objectKey: `${event.mediaId}/translated_batches/${event.batchIndex}.json`,
            url: event.url,
            size: 0,
            lastModified: null,
          },
        ].sort((left, right) => left.batchIndex - right.batchIndex);

        return {
          ...next,
          status: "PROCESSING",
          translatedBatches,
          summary: {
            ...next.summary,
            translatedBatchCount: Math.max(
              next.summary.translatedBatchCount,
              translatedBatches.length,
            ),
            latestBatchIndex:
              translatedBatches[translatedBatches.length - 1]?.batchIndex ??
              null,
          },
        };
      });

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

      const patch: Partial<MediaStatusResponse> = {
        status: "COMPLETED",
        progress: 1,
        currentStep: null,
        estimatedTimeRemaining: null,
        sourceLanguage: event.sourceLanguage,
        transcriptS3Key: event.transcriptS3Key,
      };
      patchStatus(event.mediaId, patch);
      patchList(event.mediaId, patch);
      patchArtifacts(event.mediaId, (old) => {
        const next = old ?? createEmptyArtifacts(event.mediaId, "COMPLETED");
        return {
          ...next,
          status: "COMPLETED",
          summary: {
            ...next.summary,
            hasFinal: true,
            finalObjectKey: event.transcriptS3Key,
          },
          final: {
            objectKey: event.transcriptS3Key,
            url: event.finalUrl,
            size: next.final?.size ?? 0,
            lastModified: next.final?.lastModified ?? null,
          },
        };
      });

      // Background refetch for any additional server fields
      queryClient.invalidateQueries({ queryKey: mediaKeys.all });
      queryClient.invalidateQueries({
        queryKey: mediaKeys.status(event.mediaId),
      });
      queryClient.invalidateQueries({
        queryKey: mediaKeys.artifacts(event.mediaId),
      });
    });

    // 5. media_failed — instant, bypasses throttle
    const unsubFailed = socketService.onFailed((event) => {
      delete lastProgressWrite.current[event.mediaId];

      const patch: Partial<MediaStatusResponse> = {
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
  }, [patchArtifacts, patchList, patchStatus, queryClient]);
}
