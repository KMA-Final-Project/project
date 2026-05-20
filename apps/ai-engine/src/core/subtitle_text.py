from __future__ import annotations

import re

from src.schemas import Word

_CJK_PATTERN = re.compile(r"[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]")
_MULTI_SPACE_PATTERN = re.compile(r"\s+")
_PUNCTUATION_PATTERN = re.compile(r"\s+([,.;:!?%\)\]\}])")
_OPENING_BRACKET_PATTERN = re.compile(r"([\(\[\{])\s+")
_APOSTROPHE_PATTERN = re.compile(r"\s+(['’][A-Za-z]+)")
_HYPHEN_JOIN_PATTERN = re.compile(r"(?<=[A-Za-z0-9])\s*-\s*(?=[A-Za-z])")


def contains_cjk(text: str) -> bool:
    return bool(_CJK_PATTERN.search(text))


def canonicalize_non_cjk_text(text: str) -> str:
    cleaned = _MULTI_SPACE_PATTERN.sub(" ", text.strip())
    cleaned = _HYPHEN_JOIN_PATTERN.sub("-", cleaned)
    cleaned = _PUNCTUATION_PATTERN.sub(r"\1", cleaned)
    cleaned = _OPENING_BRACKET_PATTERN.sub(r"\1", cleaned)
    cleaned = _APOSTROPHE_PATTERN.sub(r"\1", cleaned)
    cleaned = _MULTI_SPACE_PATTERN.sub(" ", cleaned)
    return cleaned.strip()


def build_sentence_text_from_words(words: list[Word]) -> str:
    tokens = [word.word.strip() for word in words if word.word.strip()]
    if not tokens:
        return ""
    if any(contains_cjk(token) for token in tokens):
        return "".join(tokens)
    return canonicalize_non_cjk_text(" ".join(tokens))
