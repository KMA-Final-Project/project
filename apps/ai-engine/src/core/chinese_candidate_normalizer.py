from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any

from src.core.subtitle_text import build_sentence_text_from_words, canonicalize_non_cjk_text
from src.schemas import Sentence

_CONTROL_RE = re.compile(r"[\u200b\u200c\u200d\ufeff]")
_SPACE_RE = re.compile(r"\s+")
_PUNCT_RE = re.compile(r"[,.!?;:，。！？；：]")
_SPACED_LATIN_RE = re.compile(r"(?:\b[A-Za-z]\b(?:\s+|$)){4,}")
_LATIN_WORD_RE = re.compile(r"[A-Za-z]{2,}")


@dataclass(slots=True)
class ChineseCandidateNormalizeResult:
    sentences: list[Sentence]
    normalization_hits: list[dict[str, Any]]

    def as_metrics(self) -> dict[str, Any]:
        return {
            "sentence_count": len(self.sentences),
            "normalization_hits": list(self.normalization_hits),
        }


def normalize_chinese_candidate_sentences(
    sentences: list[Sentence],
) -> ChineseCandidateNormalizeResult:
    normalized: list[Sentence] = []
    hits: list[dict[str, Any]] = []

    for index, sentence in enumerate(sentences):
        clone = sentence.model_copy(deep=True)
        rebuilt = canonicalize_non_cjk_text(build_sentence_text_from_words(clone.words))
        fallback = canonicalize_non_cjk_text(str(clone.text or "").strip())
        text = _prefer_text(rebuilt, fallback)
        text = _CONTROL_RE.sub("", text)
        text = _SPACE_RE.sub(" ", text).strip()
        text = canonicalize_non_cjk_text(text)
        if text != fallback and text:
            hits.append(
                {
                    "reason": "text_rebuilt_from_words",
                    "sentence_index": index,
                    "before": fallback,
                    "after": text,
                }
            )
        clone.text = text or fallback
        normalized.append(clone)

    return ChineseCandidateNormalizeResult(
        sentences=normalized,
        normalization_hits=hits,
    )


def _prefer_text(rebuilt: str, fallback: str) -> str:
    if not rebuilt:
        return fallback
    if not fallback:
        return rebuilt
    if _SPACED_LATIN_RE.search(rebuilt) and _LATIN_WORD_RE.search(fallback):
        return fallback
    rebuilt_punct = len(_PUNCT_RE.findall(rebuilt))
    fallback_punct = len(_PUNCT_RE.findall(fallback))
    if fallback_punct > rebuilt_punct and len(fallback) >= max(1, len(rebuilt) - 3):
        return fallback
    return rebuilt
