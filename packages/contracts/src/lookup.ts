export type LookupPartOfSpeech =
  | "noun"
  | "pronoun"
  | "verb"
  | "adjective"
  | "adverb"
  | "particle"
  | "classifier"
  | "preposition"
  | "conjunction"
  | "interjection"
  | "phrase"
  | "idiom"
  | "proper_noun"
  | "other";

export type LookupErrorCode =
  | "INVALID_WORD_SELECTION"
  | "INVALID_SAVE_TOKEN"
  | "MEDIA_NOT_FOUND"
  | "SUBTITLE_CONTEXT_UNAVAILABLE"
  | "LOOKUP_LIMIT_REACHED"
  | "RATE_LIMITED"
  | "LLM_UNAVAILABLE"
  | "LLM_ERROR";

export interface LookupRequest {
  segmentIndex: number;
  wordText: string;
  startWordIndex: number;
  endWordIndex: number;
}

export interface LookupData {
  word: string;
  phonetic: string;
  partOfSpeech: LookupPartOfSpeech;
  contextualDefinition: string;
  exampleSentence: string;
  exampleSentenceTranslation: string;
}

export interface LookupQuotaMeta {
  tier: "free" | "paid";
  dailyLimit: number | null;
  remainingToday: number | null;
  resetsInSeconds: number | null;
}

export interface LookupMeta {
  cacheHit: boolean;
  alreadySaved: boolean;
  saveToken: string;
  quota: LookupQuotaMeta;
}

export interface LookupResponse {
  data: LookupData;
  meta: LookupMeta;
}

export interface SaveLookupWordRequest extends LookupRequest {
  saveToken: string;
}

export interface SaveLookupWordResponse {
  created: boolean;
  item: {
    id: string;
    vocabularyId: string;
    word: string;
    sourceLanguage: string;
    phonetic: string;
    partOfSpeech: LookupPartOfSpeech;
    contextualDefinition: string;
    exampleSentence: string;
    exampleSentenceTranslation: string;
    mediaItemId: string;
    segmentIndex: number;
    startWordIndex: number;
    endWordIndex: number;
    createdAt: string;
  };
}

export interface LookupErrorResponse {
  code?: LookupErrorCode;
  message?: string;
  quota?: LookupQuotaMeta;
}
