import type { LookupPartOfSpeech } from "./lookup.js";
import type { MediaOriginType } from "./media.js";

export interface WordBankContextItem {
  id: string;
  mediaItemId: string;
  mediaTitle: string;
  mediaOriginType: MediaOriginType;
  mediaThumbnailUrl: string | null;
  mediaAvailable: boolean;
  segmentIndex: number;
  startWordIndex: number;
  endWordIndex: number;
  selectedText: string;
  phonetic: string;
  partOfSpeech: LookupPartOfSpeech;
  savedContextualDefinition: string;
  savedExampleText: string;
  savedExampleTranslation: string;
  savedAt: string;
}

export interface WordBankGroupItem {
  vocabularyId: string;
  word: string;
  sourceLanguage: string;
  phonetic: string;
  contextCount: number;
  latestSavedAt: string;
  contexts: WordBankContextItem[];
}

export interface WordBankListResponse {
  data: WordBankGroupItem[];
  meta: {
    totalGroups: number;
    totalContexts: number;
  };
}
