/**
 * useProcessingSubtitles — Kapter
 *
 * Progressively accumulates subtitle sentences as chunk_ready and batch_ready
 * events arrive via the React Query cache (populated by useSocketSync).
 *
 * Chunks carry original transcription; batches carry translations.
 *
 * --- Matching contract ---
 *
 * Tier 1 (chunk) sentences have segment_index=null. The AI Engine assigns no
 * global identity at transcription time, so array position is the only
 * available ordering handle at this layer.
 *
 * Tier 2 (batch) sentences carry an explicit segment_index that names each
 * segment's global position in the full transcript. Use segment_index — not
 * array position — as the matching key when correlating batches against
 * the final output or against each other.
 *
 * CJK limitation: the semantic merger may group multiple source sentences from
 * Tier 1 into fewer Tier 2 segments. When that happens, the array-length of
 * translated sentences is smaller than the array-length of base (chunk)
 * sentences, and 1:1 position-based overlaying produces incorrect results.
 * The merge below uses segment_index on Tier 2 segments as the authoritative
 * key, and falls back to array position only for Tier 1 (which has no index).
 * This is correct for non-CJK and will leave merged-away sentences untranslated
 * for CJK until a time-range matcher is wired in for this hook.
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

  // Merge: overlay batch translations onto chunk sentences.
  //
  // Key insight: Tier 2 batch segments carry explicit segment_index values
  // (their global position in the full transcript). Use that as the lookup key
  // so the map is identity-stable rather than position-dependent.
  //
  // For Tier 1 base sentences: segment_index is null (not assigned yet).
  // We use their array position `i` as a provisional key, which is correct for
  // non-CJK (where batch segment count equals chunk sentence count). For CJK,
  // the semantic merger reduces segment count, so some base sentences will not
  // find a translation entry — they are shown in original text. This is the
  // known limitation of position-based Tier 1 lookup; a time-range matcher
  // would resolve it but is out of scope for this milestone.
  const sentences = useMemo(() => {
    const base: Sentence[] = chunkQueries.data ?? [];
    const translated: Sentence[] = batchQueries.data ?? [];

    if (translated.length === 0) return base.slice(0, limit);

    // Build a map keyed by segment_index (Tier 2 durable identity).
    // Tier 2 batch segments always have a non-null segment_index; use it
    // directly. This makes the map correct regardless of the order in which
    // batches were fetched or whether CJK merging reduced the segment count.
    const translationMap = new Map<number, Sentence>();
    translated.forEach((s, i) => {
      // Prefer segment_index (Tier 2 identity) over the flat array position.
      // The flat position is only a reliable key for linear, non-CJK batches.
      const key = s.segment_index ?? i;
      translationMap.set(key, s);
    });

    return base.slice(0, limit).map((sentence, i) => {
      // Tier 1 sentences have segment_index=null — use array position as the
      // provisional lookup key (correct for non-CJK; approximate for CJK).
      const lookupKey = sentence.segment_index ?? i;
      const t = translationMap.get(lookupKey);
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
