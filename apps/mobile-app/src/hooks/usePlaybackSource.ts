import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { localMediaVault } from "@/services/local-media-vault";
import { mediaService } from "@/services/media.services";
import type { MediaItem } from "@/types/media";

export interface PlaybackSource {
  kind: "audio" | "video" | "none";
  uri: string | null;
  sourceKind: "local" | "cloud" | "fallback";
  canPlayVideo: boolean;
  reason?: "missing-local-video" | "not-backed-up" | "stream-unavailable";
  videoUri?: string | null;
  audioUri?: string | null;
}

const isMergedPlayableVideo = (videoUrl: string | null, audioUrl: string) =>
  Boolean(videoUrl) && videoUrl === audioUrl;

export const usePlaybackSource = (mediaItem: MediaItem | null | undefined) => {
  const localEntryQuery = useQuery({
    queryKey: ["local-media-vault", mediaItem?.id],
    queryFn: () => localMediaVault.getEntry(mediaItem!.id),
    enabled: Boolean(mediaItem?.id && mediaItem.originType === "LOCAL"),
    staleTime: Infinity,
  });

  const streamQuery = useQuery({
    queryKey: ["player-stream-url", mediaItem?.id],
    queryFn: () => mediaService.getStreamUrl(mediaItem!.id),
    enabled: Boolean(mediaItem?.id && mediaItem.originType === "YOUTUBE"),
    staleTime: 0,
    retry: 1,
  });

  const source = useMemo<PlaybackSource>(() => {
    if (!mediaItem) {
      return {
        kind: "none",
        uri: null,
        sourceKind: "fallback",
        canPlayVideo: false,
      };
    }

    const localEntry = localEntryQuery.data;
    if (localEntry?.localUri) {
      return {
        kind: localEntry.mediaKind,
        uri: localEntry.localUri,
        sourceKind: "local",
        canPlayVideo: localEntry.mediaKind === "video",
      };
    }

    if (mediaItem.originType === "YOUTUBE" && streamQuery.data) {
      const { videoUrl, audioUrl } = streamQuery.data;
      if (isMergedPlayableVideo(videoUrl, audioUrl)) {
        return {
          kind: "video",
          uri: videoUrl,
          sourceKind: "cloud",
          canPlayVideo: true,
          videoUri: videoUrl,
          audioUri: audioUrl,
        };
      }

      return {
        kind: "audio",
        uri: audioUrl,
        sourceKind: "cloud",
        canPlayVideo: false,
        audioUri: audioUrl,
        videoUri: videoUrl,
      };
    }

    if (mediaItem.originType === "LOCAL") {
      return {
        kind: "none",
        uri: null,
        sourceKind: "fallback",
        canPlayVideo: false,
        reason:
          mediaItem.durationSeconds || mediaItem.thumbnailUrl
            ? "missing-local-video"
            : "not-backed-up",
      };
    }

    return {
      kind: "none",
      uri: null,
      sourceKind: "fallback",
      canPlayVideo: false,
      reason: streamQuery.error ? "stream-unavailable" : undefined,
    };
  }, [localEntryQuery.data, mediaItem, streamQuery.data, streamQuery.error]);

  return {
    source,
    localEntry: localEntryQuery.data ?? null,
    stream: streamQuery.data ?? null,
    isLoading: localEntryQuery.isLoading || streamQuery.isLoading,
    error: localEntryQuery.error ?? streamQuery.error ?? null,
  };
};
