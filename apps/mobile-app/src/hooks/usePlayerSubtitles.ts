import { useQuery } from "@tanstack/react-query";

import { mediaService } from "@/services/media.services";
import type { SubtitleOutput } from "@/types/subtitle";
import { normalizeSubtitleOutput } from "../utils/subtitle-normalization";

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

export const usePlayerSubtitles = (mediaId: string | null) =>
  useQuery({
    queryKey: ["player-subtitles", mediaId],
    queryFn: () => fetchSubtitleOutput(mediaId!),
    enabled: Boolean(mediaId),
    staleTime: Infinity,
  });
