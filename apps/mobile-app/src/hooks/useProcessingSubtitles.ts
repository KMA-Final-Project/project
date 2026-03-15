/**
 * useProcessingSubtitles — Kapter
 *
 * Progressively accumulates subtitle sentences as chunk_ready and batch_ready
 * events arrive via the React Query cache (populated by useSocketSync).
 *
 * Chunks carry original transcription; batches carry translations.
 * Both are fetched from presigned URLs and merged by sentence index order.
 */
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { mediaKeys } from "./useMedia";
import type { Sentence, TranslatedBatch } from "@/types/subtitle";

interface ChunkCacheEntry {
  chunkIndex: number;
  url: string;
  sentenceCount: number;
}
interface BatchCacheEntry {
  batchIndex: number;
  url: string;
  segmentCount: number;
}

/**
 * Fetches accumulated subtitle data for a media item currently being processed.
 *
 * Returns the first `limit` merged sentences (chunk transcriptions + batch translations).
 */
export function useProcessingSubtitles(mediaId: string | null, limit = 5) {
  const queryClient = useQueryClient();

  // Read chunk / batch metadata from the cache (populated by useSocketSync)
  const chunks: ChunkCacheEntry[] =
    queryClient.getQueryData(mediaKeys.chunks(mediaId ?? "")) ?? [];
  const batches: BatchCacheEntry[] =
    queryClient.getQueryData(mediaKeys.batches(mediaId ?? "")) ?? [];

  // Fetch all chunk JSONs (original transcription)
  const chunkUrls = useMemo(
    () => chunks.map((c) => c.url),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chunks.length],
  );

  const chunkQueries = useQuery({
    queryKey: ["subtitle-chunks", mediaId, chunkUrls.length],
    queryFn: async () => {
      const results: Sentence[] = [];
      for (const url of chunkUrls) {
        const res = await fetch(url);
        if (!res.ok) continue;
        // Chunks are flat Sentence[] arrays (not wrapped in SubtitleOutput)
        const json: Sentence[] = await res.json();
        results.push(...json);
      }
      return results;
    },
    enabled: !!mediaId && chunkUrls.length > 0,
    staleTime: Infinity, // chunks are immutable once fetched
  });

  // Fetch all batch JSONs (translations)
  const batchUrls = useMemo(
    () => batches.map((b) => b.url),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [batches.length],
  );

  const batchQueries = useQuery({
    queryKey: ["subtitle-batches", mediaId, batchUrls.length],
    queryFn: async () => {
      const results: Sentence[] = [];
      for (const url of batchUrls) {
        const res = await fetch(url);
        if (!res.ok) continue;
        const json: TranslatedBatch = await res.json();
        results.push(...json.segments);
      }
      return results;
    },
    enabled: !!mediaId && batchUrls.length > 0,
    staleTime: Infinity,
  });

  // Merge: overlay batch translations onto chunk sentences by time-order index
  const sentences = useMemo(() => {
    const base: Sentence[] = chunkQueries.data ?? [];
    const translated: Sentence[] = batchQueries.data ?? [];

    if (translated.length === 0) return base.slice(0, limit);

    // Build a map from the batch results (which include the translation field)
    const translationMap = new Map<number, Sentence>();
    translated.forEach((s, i) => translationMap.set(i, s));

    return base.slice(0, limit).map((sentence, i) => {
      const t = translationMap.get(i);
      if (t)
        return {
          ...sentence,
          translation: t.translation,
          phonetic: t.phonetic,
        };
      return sentence;
    });
  }, [chunkQueries.data, batchQueries.data, limit]);

  return {
    sentences,
    isLoading: chunkQueries.isLoading || batchQueries.isLoading,
    chunkCount: chunks.length,
    batchCount: batches.length,
  };
}
