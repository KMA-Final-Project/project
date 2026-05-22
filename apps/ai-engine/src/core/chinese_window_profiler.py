from __future__ import annotations

from dataclasses import asdict, dataclass
import re
from typing import Any

from src.config import settings
from src.schemas import Sentence

_HAN_RE = re.compile(r"[\u4e00-\u9fff]")
_LATIN_RE = re.compile(r"[A-Za-z]")
_TOKEN_RE = re.compile(r"[A-Za-z\u4e00-\u9fff]+")


@dataclass(frozen=True, slots=True)
class ChineseSentenceProfile:
    index: int
    start: float
    end: float
    duration_seconds: float
    text: str
    han_ratio: float
    latin_ratio: float
    code_switch_density: float
    mixed_script: bool


@dataclass(frozen=True, slots=True)
class ChineseTranscriptWindow:
    index: int
    sentence_indexes: tuple[int, ...]
    start: float
    end: float
    duration_seconds: float
    gap_from_previous: float
    sentence_count: int
    han_ratio: float
    latin_ratio: float
    code_switch_density: float
    mixed_script: bool
    lexical_diversity: float
    repetition_score: float
    text: str

    def as_metrics(self) -> dict[str, Any]:
        return asdict(self)


def profile_chinese_transcript_windows(
    sentences: list[Sentence],
) -> list[ChineseTranscriptWindow]:
    if not sentences:
        return []

    sentence_profiles = [_profile_sentence(index, sentence) for index, sentence in enumerate(sentences)]
    windows: list[ChineseTranscriptWindow] = []
    current: list[ChineseSentenceProfile] = []
    current_gap = 0.0

    def flush() -> None:
        nonlocal current, current_gap
        if not current:
            return
        windows.append(_build_window(len(windows), current, current_gap))
        current = []
        current_gap = 0.0

    for sentence_profile in sentence_profiles:
        if not current:
            current.append(sentence_profile)
            continue

        previous = current[-1]
        gap = max(0.0, sentence_profile.start - previous.end)
        current_duration = current[-1].end - current[0].start
        projected_duration = sentence_profile.end - current[0].start
        projected_count = len(current) + 1
        current_density = _average_code_switch_density(current)
        density_shift = abs(sentence_profile.code_switch_density - current_density)

        should_split = False
        if gap >= settings.AI_CHINESE_WINDOW_GAP_SECONDS:
            should_split = True
        elif current_duration >= settings.AI_CHINESE_WINDOW_MAX_SECONDS:
            should_split = True
        elif projected_count > settings.AI_CHINESE_WINDOW_MAX_SENTENCES:
            should_split = True
        elif (
            len(current) >= settings.AI_CHINESE_WINDOW_MIN_SENTENCES
            and density_shift >= settings.AI_CHINESE_WINDOW_CODE_SWITCH_SHIFT
        ):
            should_split = True
        elif projected_duration > settings.AI_CHINESE_WINDOW_MAX_SECONDS:
            should_split = True

        if should_split:
            flush()
            current_gap = gap
        current.append(sentence_profile)

    flush()
    return windows


def _profile_sentence(index: int, sentence: Sentence) -> ChineseSentenceProfile:
    text = str(sentence.text or "").strip()
    han_ratio = _char_ratio(text, _HAN_RE)
    latin_ratio = _char_ratio(text, _LATIN_RE)
    density = _code_switch_density(text)
    return ChineseSentenceProfile(
        index=index,
        start=sentence.start,
        end=sentence.end,
        duration_seconds=max(0.0, sentence.end - sentence.start),
        text=text,
        han_ratio=han_ratio,
        latin_ratio=latin_ratio,
        code_switch_density=density,
        mixed_script=han_ratio > 0.0 and latin_ratio > 0.0,
    )


def _build_window(
    index: int,
    sentences: list[ChineseSentenceProfile],
    gap_from_previous: float,
) -> ChineseTranscriptWindow:
    text = " ".join(sentence.text for sentence in sentences).strip()
    return ChineseTranscriptWindow(
        index=index,
        sentence_indexes=tuple(sentence.index for sentence in sentences),
        start=sentences[0].start,
        end=sentences[-1].end,
        duration_seconds=max(0.0, sentences[-1].end - sentences[0].start),
        gap_from_previous=round(gap_from_previous, 4),
        sentence_count=len(sentences),
        han_ratio=round(_average_ratio(sentences, "han_ratio"), 4),
        latin_ratio=round(_average_ratio(sentences, "latin_ratio"), 4),
        code_switch_density=round(_average_code_switch_density(sentences), 4),
        mixed_script=any(sentence.mixed_script for sentence in sentences),
        lexical_diversity=round(_lexical_diversity(text), 4),
        repetition_score=round(_repetition_score(text), 4),
        text=text,
    )


def _average_ratio(sentences: list[ChineseSentenceProfile], field_name: str) -> float:
    if not sentences:
        return 0.0
    return sum(getattr(sentence, field_name) for sentence in sentences) / len(sentences)


def _average_code_switch_density(sentences: list[ChineseSentenceProfile]) -> float:
    if not sentences:
        return 0.0
    return sum(sentence.code_switch_density for sentence in sentences) / len(sentences)


def _char_ratio(text: str, pattern: re.Pattern[str]) -> float:
    if not text:
        return 0.0
    return sum(1 for char in text if pattern.search(char)) / len(text)


def _code_switch_density(text: str) -> float:
    han_count = sum(1 for char in text if _HAN_RE.search(char))
    latin_count = sum(1 for char in text if _LATIN_RE.search(char))
    total = han_count + latin_count
    if total == 0:
        return 0.0
    return latin_count / total


def _lexical_diversity(text: str) -> float:
    tokens = _TOKEN_RE.findall(text.lower())
    if not tokens:
        return 1.0
    return len(set(tokens)) / len(tokens)


def _repetition_score(text: str) -> float:
    tokens = _TOKEN_RE.findall(text.lower())
    if len(tokens) < 4:
        return 0.0
    unique = len(set(tokens))
    lexical_penalty = 1.0 - (unique / len(tokens))
    repeated_pairs = 0
    for index in range(2, len(tokens)):
        if tokens[index] == tokens[index - 2] and tokens[index - 1] == tokens[index - 3]:
            repeated_pairs += 1
    pair_ratio = repeated_pairs / max(len(tokens) - 2, 1)
    return min(1.0, max(lexical_penalty, pair_ratio))
