from __future__ import annotations

import re
import unicodedata

import jieba

from src.schemas import Sentence, Word

_HAN_RE = re.compile(r"[\u4e00-\u9fff]")


def segment_chinese_sentence_words(sentence: Sentence) -> bool:
    source_words = [
        word.model_copy(deep=True)
        for word in sentence.words
        if str(word.word or "").strip()
    ]
    if len(source_words) < 2:
        return False
    if not _HAN_RE.search(sentence.text or "") and not any(
        _HAN_RE.search(str(word.word or "")) for word in source_words
    ):
        return False

    lexical_tokens = _lexical_tokens_from_text(sentence.text)
    if not lexical_tokens:
        return False

    source_lexical_tokens = [
        str(word.word or "").strip()
        for word in source_words
        if _normalized_lexical_key(word.word)
    ]
    if _normalized_token_list(source_lexical_tokens) == _normalized_token_list(
        lexical_tokens
    ):
        return False

    merged_words = _merge_words_to_tokens(source_words, lexical_tokens)
    if not merged_words:
        return False

    sentence.words = merged_words
    sentence.start = merged_words[0].start
    sentence.end = merged_words[-1].end
    return True


def _lexical_tokens_from_text(text: str) -> list[str]:
    tokens: list[str] = []
    for token in jieba.cut(str(text or ""), cut_all=False):
        stripped = str(token or "").strip()
        if not stripped:
            continue
        if not _normalized_lexical_key(stripped):
            continue
        tokens.append(stripped)
    return tokens


def _merge_words_to_tokens(
    source_words: list[Word],
    target_tokens: list[str],
) -> list[Word] | None:
    merged_words: list[Word] = []
    word_index = 0

    for token in target_tokens:
        token_key = _normalized_lexical_key(token)
        if not token_key:
            continue

        consumed_words: list[Word] = []
        accumulated_key = ""
        while word_index < len(source_words) and len(accumulated_key) < len(token_key):
            next_word = source_words[word_index]
            word_index += 1
            word_key = _normalized_lexical_key(next_word.word)
            if not word_key:
                continue
            consumed_words.append(next_word)
            accumulated_key += word_key
            if accumulated_key == token_key:
                break

        if not consumed_words or accumulated_key != token_key:
            return None

        if len(consumed_words) == 1 and str(consumed_words[0].word or "").strip() == token:
            merged_words.append(consumed_words[0])
            continue

        merged_words.append(
            Word(
                word=token,
                start=consumed_words[0].start,
                end=consumed_words[-1].end,
                confidence=min(float(word.confidence or 0.0) for word in consumed_words),
                phoneme=consumed_words[0].phoneme if len(consumed_words) == 1 else None,
            )
        )

    if any(
        _normalized_lexical_key(word.word)
        for word in source_words[word_index:]
    ):
        return None
    if not merged_words:
        return None
    return merged_words


def _normalized_token_list(tokens: list[str]) -> list[str]:
    return [_normalized_lexical_key(token) for token in tokens if _normalized_lexical_key(token)]


def _normalized_lexical_key(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", str(text or ""))
    compact = "".join(
        char
        for char in normalized
        if not unicodedata.category(char).startswith(("P", "Z", "C"))
    )
    return compact.casefold()
