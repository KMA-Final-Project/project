/**
 * useProcessingSubtitles — Kapter
 *
 * Hydrates subtitle preview data from the durable artifact inventory exposed by
 * `/media/:id/artifacts`, while still benefiting from live socket cache updates
 * because `useSocketSync` patches that same query cache in real time.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMediaArtifacts } from "./useMedia";
import type {
  Sentence,
  SubtitleOutput,
  TranslatedBatch,
} from "@/types/subtitle";
import { normalizeSentence } from "../utils/subtitle-normalization";

async function fetchArtifactJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch artifact: ${response.status}`);
  }

  return (await response.json()) as T;
}

/**
 * Fetches accumulated subtitle data for a media item currently being processed.
 *
 * Returns the first `limit` merged sentences (chunk transcriptions + batch translations).
 */
export function useProcessingSubtitles(mediaId: string | null, limit = 5) {
  const { data: artifactInventory, isLoading: artifactsLoading } =
    useMediaArtifacts(mediaId);

  const finalUrl = artifactInventory?.final?.url ?? null;
  const chunkUrls = useMemo(
    () => artifactInventory?.chunks.map((chunk) => chunk.url) ?? [],
    [artifactInventory?.chunks],
  );
  const batchUrls = useMemo(
    () => artifactInventory?.translatedBatches.map((batch) => batch.url) ?? [],
    [artifactInventory?.translatedBatches],
  );

  const finalQuery = useQuery({
    queryKey: ["subtitle-final", mediaId, finalUrl],
    queryFn: () => fetchArtifactJson<SubtitleOutput>(finalUrl!),
    enabled: !!mediaId && !!finalUrl,
    staleTime: Infinity,
  });

  const chunkQuery = useQuery({
    queryKey: ["subtitle-chunks", mediaId, chunkUrls],
    queryFn: async () => {
      const results: Sentence[] = [];
      for (const url of chunkUrls) {
        const json = await fetchArtifactJson<Sentence[]>(url);
        results.push(...json);
      }
      return results;
    },
    enabled: !!mediaId && !finalUrl && chunkUrls.length > 0,
    staleTime: Infinity,
  });

  const batchQuery = useQuery({
    queryKey: ["subtitle-batches", mediaId, batchUrls],
    queryFn: async () => {
      const results: Sentence[] = [];
      for (const url of batchUrls) {
        const json = await fetchArtifactJson<TranslatedBatch>(url);
        results.push(...json.segments);
      }
      return results;
    },
    enabled: !!mediaId && !finalUrl && batchUrls.length > 0,
    staleTime: Infinity,
  });

  const sentences = useMemo(() => {
    if (finalQuery.data) {
      return finalQuery.data.segments.slice(0, limit).map(normalizeSentence);
    }

    const base: Sentence[] = (chunkQuery.data ?? []).map(normalizeSentence);
    const translated: Sentence[] = (batchQuery.data ?? []).map(normalizeSentence);

    if (translated.length === 0) return base.slice(0, limit);

    const translationMap = new Map<number, Sentence>();
    translated.forEach((s, i) => {
      const key = s.segment_index ?? i;
      translationMap.set(key, s);
    });

    return base.slice(0, limit).map((sentence, i) => {
      const lookupKey = sentence.segment_index ?? i;
      const t = translationMap.get(lookupKey);
      if (t)
        return normalizeSentence({
          ...sentence,
          translation: t.translation,
          phonetic: t.phonetic,
        });
      return sentence;
    });
  }, [batchQuery.data, chunkQuery.data, finalQuery.data, limit]);

  return {
    sentences,
    isLoading:
      artifactsLoading ||
      finalQuery.isLoading ||
      chunkQuery.isLoading ||
      batchQuery.isLoading,
    chunkCount: artifactInventory?.summary.chunkCount ?? 0,
    batchCount: artifactInventory?.summary.translatedBatchCount ?? 0,
    hasFinal: Boolean(artifactInventory?.summary.hasFinal),
  };
}
