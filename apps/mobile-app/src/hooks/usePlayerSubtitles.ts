import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { useMediaArtifacts } from "@/hooks/useMedia";
import { mediaService } from "@/services/media.services";
import type {
  Sentence,
  SubtitleMetadata,
  SubtitleOutput,
  TranslatedBatch,
} from "@/types/subtitle";
import {
  normalizeSentence,
  normalizeSubtitleOutput,
} from "@/utils/subtitle-normalization";

const fetchSubtitleOutput = async (
  mediaId: string,
): Promise<SubtitleOutput> => {
  const { url } = await mediaService.getDownloadUrl(mediaId);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch subtitles: ${response.status}`);
  }

  return normalizeSubtitleOutput((await response.json()) as SubtitleOutput);
};

const fetchArtifactJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch subtitles: ${response.status}`);
  }

  return (await response.json()) as T;
};

export interface PlayerSubtitleSession {
  metadata: SubtitleMetadata | null;
  segments: Sentence[];
  readyUntilSec: number;
  isFinal: boolean;
  isPartial: boolean;
  batchCount: number;
}

export const usePlayerSubtitles = (mediaId: string | null) => {
  const { data: artifactInventory, isLoading: artifactsLoading } =
    useMediaArtifacts(mediaId);

  const finalUrl = artifactInventory?.final?.url ?? null;
  const translatedBatches = useMemo(
    () =>
      [...(artifactInventory?.translatedBatches ?? [])].sort(
        (left, right) => left.batchIndex - right.batchIndex,
      ),
    [artifactInventory?.translatedBatches],
  );

  const finalQuery = useQuery({
    queryKey: ["player-subtitles-final", mediaId, finalUrl],
    queryFn: () => fetchSubtitleOutput(mediaId!),
    enabled: Boolean(mediaId && finalUrl),
    staleTime: Infinity,
  });

  const batchQuery = useQuery({
    queryKey: [
      "player-subtitles-batches",
      mediaId,
      translatedBatches.map((batch) => `${batch.batchIndex}:${batch.url}`),
    ],
    queryFn: async () => {
      const segmentsByIndex = new Map<number, Sentence>();

      for (const batch of translatedBatches) {
        const payload = await fetchArtifactJson<TranslatedBatch>(batch.url);

        for (const segment of payload.segments.map(normalizeSentence)) {
          if (segment.segment_index == null) {
            continue;
          }

          segmentsByIndex.set(segment.segment_index, segment);
        }
      }

      return [...segmentsByIndex.entries()]
        .sort((left, right) => left[0] - right[0])
        .map(([, segment]) => segment);
    },
    enabled: Boolean(mediaId && !finalUrl && translatedBatches.length > 0),
    staleTime: Infinity,
  });

  const session = useMemo<PlayerSubtitleSession>(() => {
    if (finalQuery.data) {
      return {
        metadata: finalQuery.data.metadata,
        segments: finalQuery.data.segments,
        readyUntilSec:
          finalQuery.data.segments[finalQuery.data.segments.length - 1]?.end ??
          0,
        isFinal: true,
        isPartial: false,
        batchCount: artifactInventory?.summary.translatedBatchCount ?? 0,
      };
    }

    const segments = batchQuery.data ?? [];

    return {
      metadata: null,
      segments,
      readyUntilSec: segments[segments.length - 1]?.end ?? 0,
      isFinal: false,
      isPartial: Boolean(mediaId) && !finalUrl,
      batchCount: translatedBatches.length,
    };
  }, [
    artifactInventory?.summary.translatedBatchCount,
    batchQuery.data,
    finalQuery.data,
    finalUrl,
    mediaId,
    translatedBatches.length,
  ]);

  const hasCoverageAt = useCallback(
    (timeSec: number) => {
      if (session.isFinal) {
        return session.segments.length > 0;
      }

      if (session.segments.length === 0) {
        return false;
      }

      return timeSec <= session.readyUntilSec + 0.05;
    },
    [session.isFinal, session.readyUntilSec, session.segments.length],
  );

  return {
    ...session,
    hasCoverageAt,
    isLoading: artifactsLoading || finalQuery.isLoading || batchQuery.isLoading,
    isError: finalQuery.isError || batchQuery.isError,
    error: finalQuery.error ?? batchQuery.error ?? null,
  };
};
