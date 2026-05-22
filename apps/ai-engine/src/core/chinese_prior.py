from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re
from typing import Any

from src.config import settings

_HAN_RE = re.compile(r"[\u4e00-\u9fff]")
_CJK_FAMILY = {"zh", "yue"}


@dataclass(frozen=True, slots=True)
class ChineseRoutePrior:
    prior_score: float
    suspected_family: str
    confidence_band: str
    sources: tuple[str, ...]
    title: str = ""
    filename: str = ""
    probe_source_lang: str = ""
    probe_scores: tuple[tuple[str, float], ...] = ()
    probe_near_tie: bool = False

    @property
    def is_chinese_family(self) -> bool:
        return self.suspected_family in _CJK_FAMILY

    @property
    def should_gate(self) -> bool:
        return self.is_chinese_family and self.prior_score >= settings.AI_CHINESE_PRIOR_MIN_SCORE

    @property
    def should_bias_route(self) -> bool:
        if not self.should_gate:
            return False
        if self.confidence_band == "strong":
            return True
        return self.probe_near_tie or not self.probe_source_lang


def build_chinese_route_prior(
    *,
    media_context: dict[str, str] | None,
    local_audio_path: Path | str | None,
    probe_source_lang: str | None,
    probe_details: dict[str, Any] | None,
) -> ChineseRoutePrior:
    context = media_context or {}
    title = str(context.get("title") or "").strip()
    audio_key = str(context.get("audioS3Key") or "").strip()
    path = Path(local_audio_path) if local_audio_path else None
    fallback_name = path.name if path is not None else ""
    filename = Path(audio_key or fallback_name).name

    score = 0.0
    sources: list[str] = []

    if _contains_han(title):
        score += 2.5
        sources.append("title_han")
    keyword_hits = _keyword_hits(title, settings.chinese_prior_title_keywords)
    if keyword_hits:
        score += min(2.0, 0.75 * keyword_hits)
        sources.append("title_keywords")

    if _contains_han(filename):
        score += 1.5
        sources.append("filename_han")
    filename_hits = _keyword_hits(filename, settings.chinese_prior_filename_keywords)
    if filename_hits:
        score += min(1.0, 0.5 * filename_hits)
        sources.append("filename_keywords")

    normalized_probe = settings.normalize_language_tag(probe_source_lang)
    scores = _normalize_probe_scores(probe_details)
    probe_near_tie = _is_probe_near_tie(scores)
    if normalized_probe in _CJK_FAMILY:
        score += 2.0
        sources.append("audio_probe_chinese")
    elif probe_near_tie and any(lang in _CJK_FAMILY for lang, _value in scores):
        score += 1.0
        sources.append("audio_probe_near_tie")

    suspected_family = ""
    if score >= settings.AI_CHINESE_PRIOR_MIN_SCORE:
        suspected_family = "yue" if normalized_probe == "yue" else "zh"

    if score >= 4.0:
        confidence_band = "strong"
    elif score >= settings.AI_CHINESE_PRIOR_MIN_SCORE:
        confidence_band = "medium"
    elif score > 0:
        confidence_band = "weak"
    else:
        confidence_band = "none"

    return ChineseRoutePrior(
        prior_score=round(score, 3),
        suspected_family=suspected_family,
        confidence_band=confidence_band,
        sources=tuple(sources),
        title=title,
        filename=filename,
        probe_source_lang=normalized_probe,
        probe_scores=tuple(scores),
        probe_near_tie=probe_near_tie,
    )


def _contains_han(text: str) -> bool:
    return bool(text and _HAN_RE.search(text))


def _keyword_hits(text: str, keywords: tuple[str, ...]) -> int:
    normalized = str(text or "").lower()
    return sum(1 for keyword in keywords if keyword and keyword in normalized)


def _normalize_probe_scores(
    probe_details: dict[str, Any] | None,
) -> list[tuple[str, float]]:
    raw_scores = (probe_details or {}).get("scores") or {}
    scores: list[tuple[str, float]] = []
    for language, value in raw_scores.items():
        normalized = settings.normalize_language_tag(language)
        if not normalized:
            continue
        try:
            scores.append((normalized, float(value)))
        except (TypeError, ValueError):
            continue
    scores.sort(key=lambda item: item[1], reverse=True)
    return scores


def _is_probe_near_tie(scores: list[tuple[str, float]]) -> bool:
    english = next((value for lang, value in scores if lang == "en"), None)
    chinese = next((value for lang, value in scores if lang in _CJK_FAMILY), None)
    if english is None or chinese is None:
        return False
    return abs(english - chinese) <= settings.AI_CHINESE_PROBE_NEAR_TIE_MARGIN
