from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any

from src.config import settings
from src.core.chinese_window_profiler import ChineseTranscriptWindow, profile_chinese_transcript_windows
from src.schemas import Sentence

_HAN_RE = re.compile(r"[\u4e00-\u9fff]")
_LATIN_RE = re.compile(r"[A-Za-z]")
_NOISE_RE = re.compile(r"[\s\W_]+")
_GREETING_HINTS = ("你好", "您好", "幸会", "請問", "请问")


@dataclass(slots=True)
class CandidateSnapshot:
    route: str
    provider: str
    sentences: list[Sentence]


@dataclass(slots=True)
class ChineseWindowRepairResult:
    sentences: list[Sentence]
    replacements: list[dict[str, Any]]

    def as_metrics(self) -> dict[str, Any]:
        return {
            "replacement_count": len(self.replacements),
            "replacements": list(self.replacements),
        }


def repair_chinese_candidate_windows(
    base_sentences: list[Sentence],
    alternate_candidates: list[CandidateSnapshot],
    repair_window_indexes: list[int],
) -> ChineseWindowRepairResult:
    if not base_sentences or not alternate_candidates or not repair_window_indexes:
        return ChineseWindowRepairResult(
            sentences=[sentence.model_copy(deep=True) for sentence in base_sentences],
            replacements=[],
        )

    repaired = [sentence.model_copy(deep=True) for sentence in base_sentences]
    replacements: list[dict[str, Any]] = []

    for window_index in sorted(set(repair_window_indexes)):
        current_windows = profile_chinese_transcript_windows(repaired)
        if window_index >= len(current_windows):
            continue
        base_window = current_windows[window_index]
        replacement = _best_replacement_window(base_window, alternate_candidates)
        if replacement is None:
            continue

        replacement_sentences, route, provider, overlap = replacement
        start = base_window.start
        end = base_window.end
        replacements.append(
            {
                "reason": "window_boundary_swap",
                "window_index": window_index,
                "route": route,
                "provider": provider,
                "base_text": base_window.text,
                "replacement_text": " ".join(sentence.text for sentence in replacement_sentences).strip(),
                "start": start,
                "end": end,
                "overlap_seconds": round(overlap, 4),
            }
        )
        repaired = _replace_window_range(repaired, start, end, replacement_sentences)

    return ChineseWindowRepairResult(
        sentences=repaired,
        replacements=replacements,
    )


def _best_replacement_window(
    base_window: ChineseTranscriptWindow,
    alternate_candidates: list[CandidateSnapshot],
) -> tuple[list[Sentence], str, str, float] | None:
    best: tuple[float, list[Sentence], str, str, float] | None = None
    base_score = _window_score(base_window.text)

    for candidate in alternate_candidates:
        windows = profile_chinese_transcript_windows(candidate.sentences)
        for window in windows:
            overlap = _overlap_seconds(base_window.start, base_window.end, window.start, window.end)
            if overlap <= 0.0:
                continue
            if overlap < min(0.75, 0.4 * base_window.duration_seconds):
                continue
            alt_sentences = [
                candidate.sentences[index].model_copy(deep=True)
                for index in window.sentence_indexes
            ]
            score = _window_score(window.text)
            if not _should_swap(base_window, base_score, window, score):
                continue
            if best is None or score > best[0]:
                best = (score, alt_sentences, candidate.route, candidate.provider, overlap)

    if best is None:
        return None
    return best[1], best[2], best[3], best[4]


def _should_swap(
    base_window: ChineseTranscriptWindow,
    base_score: float,
    alternate_window: ChineseTranscriptWindow,
    alternate_score: float,
) -> bool:
    if alternate_score < base_score + 1.0:
        return False
    if alternate_window.han_ratio > base_window.han_ratio + 0.08:
        return True
    if _mixed_script_score(alternate_window.text) > _mixed_script_score(base_window.text):
        return True
    if _greeting_hint_score(alternate_window.text) > _greeting_hint_score(base_window.text):
        return True
    if _text_length_score(alternate_window.text) > _text_length_score(base_window.text) + 6:
        return True
    return alternate_score >= base_score + 4.0


def _replace_window_range(
    sentences: list[Sentence],
    start: float,
    end: float,
    replacement_sentences: list[Sentence],
) -> list[Sentence]:
    before = [sentence for sentence in sentences if sentence.end <= start]
    after = [sentence for sentence in sentences if sentence.start >= end]
    merged = before + [sentence.model_copy(deep=True) for sentence in replacement_sentences] + after
    merged.sort(key=lambda sentence: (sentence.start, sentence.end))
    return merged


def _window_score(text: str) -> float:
    return (
        _text_length_score(text)
        + _mixed_script_score(text)
        + _greeting_hint_score(text)
        + (_han_ratio(text) * 10.0)
    )


def _text_length_score(text: str) -> float:
    normalized = _NOISE_RE.sub("", text)
    return float(len(normalized))


def _mixed_script_score(text: str) -> float:
    has_han = bool(_HAN_RE.search(text))
    has_latin = bool(_LATIN_RE.search(text))
    return 8.0 if has_han and has_latin else 0.0


def _greeting_hint_score(text: str) -> float:
    return float(sum(3 for hint in _GREETING_HINTS if hint in text))


def _han_ratio(text: str) -> float:
    if not text:
        return 0.0
    return sum(1 for char in text if _HAN_RE.search(char)) / len(text)


def _overlap_seconds(start_a: float, end_a: float, start_b: float, end_b: float) -> float:
    return max(0.0, min(end_a, end_b) - max(start_a, start_b))
