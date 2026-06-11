export interface Word {
  word: string;
  start: number;
  end: number;
  confidence: number;
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
  segment_index: number | null;
}

export interface SubtitleMetadata {
  duration: number;
  engine_profile: string;
  source_lang: string;
  target_lang: string;
  model_used: string;
  translation_finalization?: TranslationFinalizationMetadata;
}

export interface SubtitleOutput {
  metadata: SubtitleMetadata;
  segments: Sentence[];
}

export interface TranslatedBatch {
  batch_index: number;
  first_segment_index: number;
  segments: Sentence[];
}

export interface SegmentTranslationProvenance {
  segment_index: number;
  source: "nmt" | "llm_revision";
  revision_index: number | null;
}

export interface TranslationFinalizationMetadata {
  enabled: boolean;
  applied_profile: string;
  provider: string;
  model: string;
  coverage_segments: number;
  coverage_duration_seconds: number;
  attempted_windows: number;
  completed_windows: number;
  timed_out_windows: number;
  invalid_windows: number;
  failed_windows: number;
  fallback_segments: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  total_cost_usd: number;
  finalization_deadline_hit: boolean;
  segment_provenance: SegmentTranslationProvenance[];
}
