/**
 * Subtitle Types — Kapter
 *
 * TypeScript interfaces matching the AI Engine Pydantic models (schemas.py).
 * Used when fetching chunk/batch/final JSON from presigned URLs.
 *
 * --- Durable contract rules ---
 *
 * Tier 1 (chunk):
 *   - Top-level array of Sentence
 *   - segment_index is always null — global ordering is not yet known at
 *     transcription time. Array position is the only ordering handle.
 *
 * Tier 2 (translated_batch):
 *   - Top-level TranslatedBatch object
 *   - segment_index is always an integer — matches the segment's position in
 *     the complete accumulated transcript
 *   - first_segment_index is a cheap range anchor:
 *     the batch covers [first_segment_index, first_segment_index + segments.length)
 *   - CJK batches may contain fewer segments than the source Tier 1 chunks
 *     (semantic merger groups sentences across chunks), so 1:1 Tier 1→Tier 2
 *     mapping by array position is NOT guaranteed
 *
 * Final (final.json):
 *   - Top-level SubtitleOutput object (metadata + segments)
 *   - segment_index on every segment is a consecutive 0-based integer
 *   - This is the authoritative ordering signal for complete-transcript consumers
 */

export interface Word {
  word: string;
  start: number;
  end: number;
  confidence: number;
  /**
   * Word-level phoneme string. Always present in serialized artifacts (never
   * absent from the JSON object), but may be null if phoneme enrichment did
   * not run. Use `phoneme !== null` rather than `phoneme !== undefined`.
   */
  phoneme: string | null;
}

export interface Sentence {
  text: string;
  start: number;
  end: number;
  words: Word[];
  translation: string;
  phonetic: string;
  detected_lang: string;
  /**
   * 0-indexed global position of this segment in the complete transcript.
   * Null on Tier 1 raw chunks (global ordering not yet known).
   * Always present as a number on Tier 2 translated batches and final.json.
   * Use this for cross-artifact matching instead of relying on array position.
   */
  segment_index: number | null;
}

export interface SubtitleMetadata {
  duration: number;
  engine_profile: string;
  source_lang: string;
  target_lang: string;
  model_used: string;
}

export interface SubtitleOutput {
  metadata: SubtitleMetadata;
  segments: Sentence[];
}

export interface TranslatedBatch {
  batch_index: number;
  /**
   * 0-indexed global position of the first segment in this batch.
   * Cheap range anchor: the batch covers [first_segment_index, first_segment_index + segments.length).
   * Use to correlate this batch against Tier 1 chunks or final.json without scanning segment arrays.
   */
  first_segment_index: number;
  segments: Sentence[];
}
