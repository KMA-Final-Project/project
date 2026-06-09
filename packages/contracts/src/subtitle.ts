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
