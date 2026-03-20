/**
 * Subtitle Types — Kapter
 *
 * TypeScript interfaces matching the AI Engine Pydantic models (schemas.py).
 * Used when fetching chunk/batch/final JSON from presigned URLs.
 */

export interface Word {
  word: string;
  start: number;
  end: number;
  confidence: number;
  phoneme?: string | null;
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
