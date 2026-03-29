import type { Sentence, SubtitleOutput, Word } from "@/types/subtitle";

const cjkPattern = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;
const punctuationPattern = /\s+([,.;:!?%\)\]\}])/g;
const openingBracketPattern = /([\(\[\{])\s+/g;
const apostrophePattern = /\s+(['’][A-Za-z]+)/g;

function normalizeWord(word: Word): Word {
  return {
    ...word,
    word: word.word.trim(),
    phoneme: word.phoneme?.trim() || null,
  };
}

function buildSentenceText(sentence: Sentence, words: Word[]): string {
  const tokens = words.map((word) => word.word).filter(Boolean);
  if (tokens.length === 0) {
    return sentence.text.trim();
  }

  if (tokens.some((token) => cjkPattern.test(token))) {
    return tokens.join("");
  }

  return tokens
    .join(" ")
    .replace(punctuationPattern, "$1")
    .replace(openingBracketPattern, "$1")
    .replace(apostrophePattern, "$1");
}

function deriveSentencePhonetic(sentence: Sentence, words: Word[]): string {
  const normalizedPhonetic = sentence.phonetic.trim();
  if (normalizedPhonetic) {
    return normalizedPhonetic;
  }

  return words
    .map((word) => word.phoneme)
    .filter((phoneme): phoneme is string => Boolean(phoneme))
    .join(" ");
}

export function normalizeSentence(sentence: Sentence): Sentence {
  const words = sentence.words.map(normalizeWord).filter((word) => word.word);

  return {
    ...sentence,
    text: buildSentenceText(sentence, words),
    words,
    translation: sentence.translation.trim(),
    phonetic: deriveSentencePhonetic(sentence, words),
    detected_lang: sentence.detected_lang.trim(),
  };
}

export function normalizeSubtitleOutput(
  subtitleOutput: SubtitleOutput,
): SubtitleOutput {
  return {
    ...subtitleOutput,
    segments: subtitleOutput.segments.map(normalizeSentence),
  };
}
