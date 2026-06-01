from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass
from typing import Any, Callable, Pattern, Sequence

from loguru import logger

from src.config import settings
from src.schemas import Sentence

from .prompts import CHINESE_BATCH_LLM_RESCUE_SYSTEM_PROMPT

CHINESE_BATCH_RESCUE_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "segments": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer"},
                    "punctuated_source": {"type": "string"},
                    "translation": {"type": "string"},
                },
                "required": ["id", "punctuated_source", "translation"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["segments"],
    "additionalProperties": False,
}

SPLIT_HINT_TOKEN = "[split_hint]"
_HINT_TOKEN_NEEDLE = "splithint"
_STRONG_PUNCTUATION = set("。！？!?")
_TERMINAL_PUNCTUATION = _STRONG_PUNCTUATION | {"."}
_HINT_VARIANT_PATTERN = re.compile(
    r"\[\s*split(?:[_\-\s]+)hint\s*\]",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class RadarRule:
    name: str
    severity: str
    pattern: Pattern[str]


@dataclass(frozen=True)
class ChinesePromptTargetSegment:
    id: int
    raw_text: str
    text_with_hints: str
    radar_flags: tuple[str, ...]

    def as_prompt_payload(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "id": self.id,
            "raw_text": self.raw_text,
            "text_with_hints": self.text_with_hints,
        }
        if self.radar_flags:
            payload["radar_flags"] = list(self.radar_flags)
        return payload


HARD_SPLIT_RULES = (
    RadarRule(
        name="greeting_to_inquiry",
        severity="hard_split",
        pattern=re.compile(
            r"(?P<left>(?:你好|您好|幸会))(?:[，,、 ]*)(?P<right>(?:请问|请教|请问一下))"
        ),
    ),
    RadarRule(
        name="intro_to_identity_turn",
        severity="hard_split",
        pattern=re.compile(
            r"(?P<left>(?:我是|我叫|我姓))(?:[，,、 ]*)(?P<right>(?:你是|您是|你呢|您呢))"
        ),
    ),
    RadarRule(
        name="identity_to_intro_turn",
        severity="hard_split",
        pattern=re.compile(
            r"(?P<left>(?:你是|您是))(?:[，,、 ]*)(?P<right>(?:我是|我叫|我姓))"
        ),
    ),
    RadarRule(
        name="question_particle_to_new_turn",
        severity="hard_split",
        pattern=re.compile(
            r"(?P<left>(?:吗|吧|呢|呀|啊))(?:[，,、 ]*)(?P<right>(?:你好|您好|幸会|请问|请教|我是|我叫|我姓|你是|您是))"
        ),
    ),
    RadarRule(
        name="polite_phrase_to_wait_question",
        severity="hard_split",
        pattern=re.compile(
            r"(?P<left>(?:幸会(?:幸会)?|你好(?:你好)?|谢谢(?:谢谢)?))(?:[，,、 ]*)(?P<right>(?:等(?:很)?久了?吗|久等了?吗|等久了吗))"
        ),
    ),
)
_HARD_RADAR_RULE_NAMES = frozenset(rule.name for rule in HARD_SPLIT_RULES)

SOFT_RISK_RULES = (
    RadarRule(
        name="greeting_to_intro_soft",
        severity="soft_risk",
        pattern=re.compile(r"(?:你好|您好|幸会)(?:[，,、 ]*)(?:我是|我叫|我姓)"),
    ),
    RadarRule(
        name="confirmation_to_meeting_chain",
        severity="soft_risk",
        pattern=re.compile(
            r"(?:对|是的|嗯|没错)(?:[，,、 ]*)(?:是我|我是|我叫|第一次见面|初次见面)"
        ),
    ),
    RadarRule(
        name="first_meeting_politeness_chain",
        severity="soft_risk",
        pattern=re.compile(
            r"(?:第一次见面|初次见面)(?:[，,、 ]*)(?:幸会(?:幸会)?|很高兴认识你|很高兴见到你)"
        ),
    ),
    RadarRule(
        name="politeness_duplication",
        severity="soft_risk",
        pattern=re.compile(r"(?P<lemma>幸会|你好|谢谢)(?:[，,、 ]*)(?P=lemma)"),
    ),
    RadarRule(
        name="turn_stack_soft",
        severity="soft_risk",
        pattern=re.compile(
            r"(?:请问|你是|您是|我是|我叫)[^。！？!?]{0,6}(?:你是|您是|我是|我叫)"
        ),
    ),
)

NEGATIVE_GUARD_PATTERNS = (
    re.compile(r"是不是"),
    re.compile(r"就是"),
    re.compile(r"要是"),
    re.compile(r"但是"),
    re.compile(r"可是"),
    re.compile(r"于是"),
    re.compile(r"还是"),
    re.compile(r"总是"),
    re.compile(r"真是"),
    re.compile(r"像是"),
    re.compile(r"算是"),
    re.compile(r"是因为"),
    re.compile(r"是为了"),
    re.compile(r"是这样"),
)


@dataclass(frozen=True)
class ChineseBatchRiskAssessment:
    triggered: bool
    reasons: tuple[str, ...]
    target_segment_count: int
    total_duration: float
    source_chars: int
    han_chars: int
    punctuation_density: float
    mixed_script_segments: int
    context_mixed_script_segments: int
    question_segments: int
    short_dialogue_segments: int
    max_unpunctuated_run: int

    def as_metrics(self) -> dict[str, Any]:
        return {
            "triggered": self.triggered,
            "reasons": list(self.reasons),
            "target_segment_count": self.target_segment_count,
            "total_duration": round(self.total_duration, 3),
            "source_chars": self.source_chars,
            "han_chars": self.han_chars,
            "punctuation_density": round(self.punctuation_density, 4),
            "mixed_script_segments": self.mixed_script_segments,
            "context_mixed_script_segments": self.context_mixed_script_segments,
            "question_segments": self.question_segments,
            "short_dialogue_segments": self.short_dialogue_segments,
            "max_unpunctuated_run": self.max_unpunctuated_run,
        }


@dataclass(frozen=True)
class ChineseBatchValidationResult:
    accepted: bool
    reason_code: str
    segment_count: int
    details: tuple[dict[str, Any], ...]

    def as_metrics(self) -> dict[str, Any]:
        return {
            "accepted": self.accepted,
            "reason_code": self.reason_code,
            "segment_count": self.segment_count,
            "details": list(self.details),
        }


@dataclass(frozen=True)
class ChineseBatchLLMSubBatchResult:
    sentences: tuple[Sentence, ...]
    strategy_used: str
    risk: ChineseBatchRiskAssessment
    validation: ChineseBatchValidationResult
    llm_metadata: dict[str, Any]

    def as_metrics(self) -> dict[str, Any]:
        return {
            "strategy_used": self.strategy_used,
            "risk": self.risk.as_metrics(),
            "validation": self.validation.as_metrics(),
            "llm_metadata": dict(self.llm_metadata),
        }


@dataclass(frozen=True)
class ChineseBatchLLMResult:
    sentences: tuple[Sentence, ...]
    sub_batches: tuple[ChineseBatchLLMSubBatchResult, ...]

    def as_metrics(self) -> dict[str, Any]:
        return {
            "sub_batches": [item.as_metrics() for item in self.sub_batches],
            "llm_batches_used": sum(
                1
                for item in self.sub_batches
                if item.strategy_used in {"llm_rescue", "llm_rescue_partial"}
            ),
            "fallback_batches": sum(
                1
                for item in self.sub_batches
                if item.strategy_used in {"llm_rescue_fallback", "llm_rescue_partial"}
            ),
        }


def _append_unique(items: list[str], value: str) -> None:
    if value not in items:
        items.append(value)


def _strip_hint_token_variants(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text).casefold()
    return _HINT_VARIANT_PATTERN.sub("", normalized)


def _normalize_for_canonical_match(text: str) -> str:
    normalized = _strip_hint_token_variants(text)
    return "".join(
        char
        for char in normalized
        if not unicodedata.category(char).startswith(("P", "Z", "C"))
    )


def _hint_token_leaked(text: str) -> bool:
    normalized = unicodedata.normalize("NFKC", text).casefold()
    compact = "".join(
        char
        for char in normalized
        if not unicodedata.category(char).startswith(("P", "Z", "C"))
    )
    return _HINT_TOKEN_NEEDLE in compact


def _han_char_count(text: str) -> int:
    return sum(1 for char in text if "\u4e00" <= char <= "\u9fff")


def _latin_char_count(text: str) -> int:
    return sum(1 for char in text if "a" <= char.lower() <= "z")


def _terminal_punctuation_count(text: str) -> int:
    stripped = text.rstrip()
    if not stripped:
        return 0
    return 1 if stripped[-1] in _TERMINAL_PUNCTUATION else 0


def _contains_terminal_punctuation(text: str) -> bool:
    return _terminal_punctuation_count(text) > 0


def _mixed_script(text: str) -> bool:
    return _han_char_count(text) > 0 and _latin_char_count(text) > 0


class ChineseBatchLLMTranslator:
    def __init__(self, llm_provider: Any) -> None:
        self._llm = llm_provider

    def _should_split_leading_mixed_script_context(
        self,
        sentences: Sequence[Sentence],
        start: int,
    ) -> bool:
        if start >= len(sentences):
            return False
        leading = sentences[start]
        if not _mixed_script(leading.text):
            return False

        lookahead = list(
            sentences[
                start + 1 : min(
                    len(sentences),
                    start
                    + 1
                    + settings.AI_CHINESE_LLM_RESCUE_COMPACT_DIALOGUE_MAX_SEGMENTS,
                )
            ]
        )
        if len(lookahead) < 2:
            return False

        question_segments = sum(
            1 for sentence in lookahead if "？" in sentence.text or "?" in sentence.text
        )
        short_dialogue_segments = sum(
            1
            for sentence in lookahead
            if (
                sentence.end - sentence.start
                <= settings.AI_CHINESE_LLM_RESCUE_SHORT_SEGMENT_MAX_SECONDS
            )
        )
        total_duration = max(0.0, lookahead[-1].end - lookahead[0].start)
        return (
            question_segments >= 1
            and short_dialogue_segments
            >= settings.AI_CHINESE_LLM_RESCUE_COMPACT_DIALOGUE_MIN_SHORT_SEGMENTS
            and total_duration
            <= settings.AI_CHINESE_LLM_RESCUE_COMPACT_DIALOGUE_MAX_SECONDS
        )

    def _target_windows(self, sentences: Sequence[Sentence]) -> list[tuple[int, int]]:
        windows: list[tuple[int, int]] = []
        start = 0
        while start < len(sentences):
            if self._should_split_leading_mixed_script_context(sentences, start):
                windows.append((start, start + 1))
                start += 1
                continue
            end = start
            total_chars = 0
            window_start = sentences[start].start
            while end < len(sentences):
                candidate = sentences[end]
                candidate_chars = len(candidate.text)
                candidate_duration = candidate.end - window_start
                if end > start:
                    if end - start >= settings.AI_CHINESE_LLM_RESCUE_MAX_SEGMENTS:
                        break
                    if (
                        candidate_duration
                        > settings.AI_CHINESE_LLM_RESCUE_MAX_SECONDS
                    ):
                        break
                    if (
                        total_chars + candidate_chars
                        > settings.AI_CHINESE_LLM_RESCUE_MAX_SOURCE_CHARS
                    ):
                        break
                total_chars += candidate_chars
                end += 1
            windows.append((start, end))
            start = end
        return windows

    @staticmethod
    def _rescue_indexes_for_hard_radar(
        prompt_segments: Sequence[ChinesePromptTargetSegment],
    ) -> tuple[int, ...]:
        hard_indexes = {
            index
            for index, segment in enumerate(prompt_segments)
            if any(flag in _HARD_RADAR_RULE_NAMES for flag in segment.radar_flags)
        }
        if not hard_indexes:
            return ()
        rescue_indexes = set(hard_indexes)
        for index, segment in enumerate(prompt_segments):
            if not segment.radar_flags:
                continue
            if index - 1 in hard_indexes or index + 1 in hard_indexes:
                rescue_indexes.add(index)
        return tuple(sorted(rescue_indexes))

    def _target_windows_for_translation(
        self,
        sentences: Sequence[Sentence],
        *,
        source_lang: str | None,
        actual_route: str | None,
    ) -> list[tuple[int, int]]:
        coarse_windows = self._target_windows(sentences)
        refined_windows: list[tuple[int, int]] = []
        for start, end in coarse_windows:
            batch = sentences[start:end]
            prompt_segments = self._build_prompt_target_segments(
                batch,
                source_lang=source_lang,
                actual_route=actual_route,
            )
            rescue_indexes = self._rescue_indexes_for_hard_radar(prompt_segments)
            if not rescue_indexes:
                refined_windows.append((start, end))
                continue

            cursor = 0
            run_start = rescue_indexes[0]
            run_end = rescue_indexes[0] + 1
            for index in rescue_indexes[1:]:
                if index == run_end:
                    run_end = index + 1
                    continue
                if cursor < run_start:
                    refined_windows.append((start + cursor, start + run_start))
                refined_windows.append((start + run_start, start + run_end))
                cursor = run_end
                run_start = index
                run_end = index + 1

            if cursor < run_start:
                refined_windows.append((start + cursor, start + run_start))
            refined_windows.append((start + run_start, start + run_end))
            cursor = run_end
            if cursor < len(batch):
                refined_windows.append((start + cursor, end))
        return refined_windows

    def _linguistic_radar_active(
        self,
        *,
        source_lang: str | None,
        actual_route: str | None,
    ) -> bool:
        normalized_source = settings.normalize_language_tag(source_lang)
        normalized_route = settings.normalize_route_id(actual_route)
        return (
            settings.AI_CHINESE_LINGUISTIC_RADAR_ENABLED
            and settings.AI_CHINESE_LLM_RESCUE_SPLIT_HINTS_ENABLED
            and normalized_source in {"zh", "yue"}
            and normalized_route
            in settings.chinese_llm_rescue_split_hint_route_ids
        )

    @staticmethod
    def _negative_guard_spans(text: str) -> tuple[tuple[int, int], ...]:
        spans: list[tuple[int, int]] = []
        for pattern in NEGATIVE_GUARD_PATTERNS:
            spans.extend((match.start(), match.end()) for match in pattern.finditer(text))
        return tuple(spans)

    @staticmethod
    def _boundary_inside_guard(
        boundary: int,
        guard_spans: Sequence[tuple[int, int]],
    ) -> bool:
        return any(start < boundary < end for start, end in guard_spans)

    @staticmethod
    def _find_original_boundary(
        text: str,
        *,
        left: str,
        right: str,
        start_at: int,
    ) -> tuple[int, str] | None:
        boundary_pattern = re.compile(
            rf"(?P<left>{re.escape(left)})(?P<separator>[，,、 ]*)(?P<right>{re.escape(right)})"
        )
        for match in boundary_pattern.finditer(text, start_at):
            return match.start("right"), match.group("separator")
        return None

    def _build_prompt_target_segment(
        self,
        sentence: Sentence,
        *,
        segment_id: int,
        source_lang: str | None,
        actual_route: str | None,
        remaining_batch_injections: int,
    ) -> tuple[ChinesePromptTargetSegment, int]:
        raw_text = sentence.text
        if not raw_text or not self._linguistic_radar_active(
            source_lang=source_lang,
            actual_route=actual_route,
        ):
            return (
                ChinesePromptTargetSegment(
                    id=segment_id,
                    raw_text=raw_text,
                    text_with_hints=raw_text,
                    radar_flags=(),
                ),
                0,
            )

        normalized_text = unicodedata.normalize("NFKC", raw_text)
        guard_spans = self._negative_guard_spans(normalized_text)
        flags: list[str] = []
        original_boundaries: list[int] = []
        search_pos = 0

        for rule in HARD_SPLIT_RULES:
            for match in rule.pattern.finditer(normalized_text):
                _append_unique(flags, rule.name)
                boundary = match.start("right")
                if self._boundary_inside_guard(boundary, guard_spans):
                    continue
                located = self._find_original_boundary(
                    raw_text,
                    left=match.group("left"),
                    right=match.group("right"),
                    start_at=search_pos,
                )
                if located is None:
                    continue
                original_boundary, separator = located
                search_pos = original_boundary
                if any(char in _STRONG_PUNCTUATION for char in separator):
                    continue
                if original_boundary not in original_boundaries:
                    original_boundaries.append(original_boundary)

        for rule in SOFT_RISK_RULES:
            if rule.pattern.search(normalized_text):
                _append_unique(flags, rule.name)

        if not flags:
            return (
                ChinesePromptTargetSegment(
                    id=segment_id,
                    raw_text=raw_text,
                    text_with_hints=raw_text,
                    radar_flags=(),
                ),
                0,
            )

        flags = ["structural_jamming_risk", *flags]
        max_segment_injections = max(
            0, settings.AI_CHINESE_LLM_RESCUE_SPLIT_HINT_MAX_PER_SEGMENT
        )
        allowed_injections = min(max_segment_injections, max(0, remaining_batch_injections))
        text_with_hints = raw_text
        inserted = 0
        offset = 0
        for original_boundary in original_boundaries:
            if inserted >= allowed_injections:
                break
            insertion_index = original_boundary + offset
            left_bound = max(0, insertion_index - 4)
            right_bound = min(
                len(text_with_hints),
                insertion_index + 4 + len(SPLIT_HINT_TOKEN),
            )
            if SPLIT_HINT_TOKEN in text_with_hints[left_bound:right_bound]:
                continue
            text_with_hints = (
                text_with_hints[:insertion_index]
                + SPLIT_HINT_TOKEN
                + text_with_hints[insertion_index:]
            )
            inserted += 1
            offset += len(SPLIT_HINT_TOKEN)

        return (
            ChinesePromptTargetSegment(
                id=segment_id,
                raw_text=raw_text,
                text_with_hints=text_with_hints,
                radar_flags=tuple(flags),
            ),
            inserted,
        )

    def _build_prompt_target_segments(
        self,
        sentences: Sequence[Sentence],
        *,
        source_lang: str | None,
        actual_route: str | None,
    ) -> tuple[ChinesePromptTargetSegment, ...]:
        payloads: list[ChinesePromptTargetSegment] = []
        remaining_batch_injections = max(
            0, settings.AI_CHINESE_LLM_RESCUE_SPLIT_HINT_MAX_PER_BATCH
        )
        for index, sentence in enumerate(sentences):
            payload, inserted = self._build_prompt_target_segment(
                sentence,
                segment_id=index,
                source_lang=source_lang,
                actual_route=actual_route,
                remaining_batch_injections=remaining_batch_injections,
            )
            payloads.append(payload)
            remaining_batch_injections = max(0, remaining_batch_injections - inserted)
        return tuple(payloads)

    def assess_batch(
        self,
        sentences: Sequence[Sentence],
        *,
        context_before: Sequence[Sentence] | None = None,
        context_after: Sequence[Sentence] | None = None,
        source_lang: str | None = None,
        actual_route: str | None = None,
    ) -> ChineseBatchRiskAssessment:
        total_duration = (
            max(0.0, sentences[-1].end - sentences[0].start) if sentences else 0.0
        )
        source_chars = sum(len(sentence.text) for sentence in sentences)
        han_chars = sum(_han_char_count(sentence.text) for sentence in sentences)
        punctuation_count = sum(
            _terminal_punctuation_count(sentence.text) for sentence in sentences
        )
        punctuation_density = (
            punctuation_count / max(han_chars, 1) if sentences else 0.0
        )
        mixed_script_segments = sum(
            1 for sentence in sentences if _mixed_script(sentence.text)
        )
        context_mixed_script_segments = sum(
            1
            for sentence in [*(context_before or ()), *(context_after or ())]
            if _mixed_script(sentence.text)
        )
        question_segments = sum(
            1 for sentence in sentences if "？" in sentence.text or "?" in sentence.text
        )
        short_dialogue_segments = sum(
            1
            for sentence in sentences
            if (
                sentence.end - sentence.start
                <= settings.AI_CHINESE_LLM_RESCUE_SHORT_SEGMENT_MAX_SECONDS
            )
        )

        reasons: list[str] = []
        prompt_target_segments = self._build_prompt_target_segments(
            sentences,
            source_lang=source_lang,
            actual_route=actual_route,
        )
        radar_reasons: list[str] = []
        for payload in prompt_target_segments:
            for flag in payload.radar_flags:
                _append_unique(radar_reasons, flag)
        if radar_reasons:
            reasons.extend(radar_reasons)

        max_run = 0
        run = 0
        overlong_indexes: list[int] = []
        for index, sentence in enumerate(sentences):
            if not _contains_terminal_punctuation(sentence.text):
                run += 1
                max_run = max(max_run, run)
            else:
                run = 0
            if not _contains_terminal_punctuation(sentence.text):
                duration = sentence.end - sentence.start
                han_count = _han_char_count(sentence.text)
                if (
                    duration > settings.AI_CHINESE_LLM_RESCUE_OVERLONG_SECONDS
                    or han_count > settings.AI_CHINESE_LLM_RESCUE_OVERLONG_HAN_CHARS
                ):
                    overlong_indexes.append(index)

        if (
            len(sentences) >= settings.AI_CHINESE_LLM_RESCUE_TERMINAL_RUN
            and max_run >= settings.AI_CHINESE_LLM_RESCUE_TERMINAL_RUN
        ):
            _append_unique(reasons, "terminal_punctuation_missing_run")
        if (
            han_chars >= settings.AI_CHINESE_LLM_RESCUE_MIN_HAN_CHARS
            and punctuation_density < settings.AI_CHINESE_LLM_RESCUE_MIN_PUNCT_DENSITY
        ):
            _append_unique(reasons, "low_punctuation_density")
        if (
            mixed_script_segments >= 2
            and punctuation_density < settings.AI_CHINESE_LLM_RESCUE_MIN_PUNCT_DENSITY
        ):
            _append_unique(reasons, "mixed_script_structural_risk")
        if (
            source_chars >= settings.AI_CHINESE_LLM_RESCUE_MIN_SOURCE_CHARS
            and question_segments >= 1
            and short_dialogue_segments
            >= settings.AI_CHINESE_LLM_RESCUE_COMPACT_DIALOGUE_MIN_SHORT_SEGMENTS
            and len(sentences)
            <= settings.AI_CHINESE_LLM_RESCUE_COMPACT_DIALOGUE_MAX_SEGMENTS
            and total_duration
            <= settings.AI_CHINESE_LLM_RESCUE_COMPACT_DIALOGUE_MAX_SECONDS
            and (mixed_script_segments >= 1 or context_mixed_script_segments >= 1)
        ):
            _append_unique(reasons, "mixed_script_dialogue_bridge")
        if overlong_indexes:
            _append_unique(reasons, "overlong_unpunctuated_segment")

        radar_triggered = "structural_jamming_risk" in radar_reasons
        heuristic_triggered = (
            len(sentences) >= 2
            and (
                han_chars >= settings.AI_CHINESE_LLM_RESCUE_MIN_HAN_CHARS
                or source_chars >= settings.AI_CHINESE_LLM_RESCUE_MIN_SOURCE_CHARS
            )
            and bool(reasons)
        )
        triggered = radar_triggered or heuristic_triggered
        return ChineseBatchRiskAssessment(
            triggered=triggered,
            reasons=tuple(reasons),
            target_segment_count=len(sentences),
            total_duration=total_duration,
            source_chars=source_chars,
            han_chars=han_chars,
            punctuation_density=punctuation_density,
            mixed_script_segments=mixed_script_segments,
            context_mixed_script_segments=context_mixed_script_segments,
            question_segments=question_segments,
            short_dialogue_segments=short_dialogue_segments,
            max_unpunctuated_run=max_run,
        )

    def _build_prompt_payload(
        self,
        sentences: Sequence[Sentence],
        context_before: Sequence[Sentence],
        context_after: Sequence[Sentence],
        target_lang: str,
        *,
        source_lang: str | None,
        actual_route: str | None,
    ) -> str:
        payload = {
            "context_before": [
                {"text": sentence.text} for sentence in context_before if sentence.text
            ],
            "target_segments": [
                target_segment.as_prompt_payload()
                for target_segment in self._build_prompt_target_segments(
                    sentences,
                    source_lang=source_lang,
                    actual_route=actual_route,
                )
            ],
            "context_after": [
                {"text": sentence.text} for sentence in context_after if sentence.text
            ],
            "target_language": target_lang,
        }
        return json.dumps(payload, ensure_ascii=False)

    def _validate_llm_output(
        self,
        original_sentences: Sequence[Sentence],
        raw_text: str,
    ) -> tuple[list[Sentence | None], ChineseBatchValidationResult]:
        try:
            parsed = json.loads(raw_text)
        except json.JSONDecodeError:
            return [], ChineseBatchValidationResult(
                accepted=False,
                reason_code="json_decode_failed",
                segment_count=0,
                details=(),
            )

        segments = parsed.get("segments")
        if not isinstance(segments, list):
            return [], ChineseBatchValidationResult(
                accepted=False,
                reason_code="segments_missing",
                segment_count=0,
                details=(),
            )
        if len(segments) != len(original_sentences):
            return [], ChineseBatchValidationResult(
                accepted=False,
                reason_code="segment_count_mismatch",
                segment_count=len(segments),
                details=(),
            )

        updated: list[Sentence | None] = []
        details: list[dict[str, Any]] = []
        invalid_indexes: list[int] = []
        for expected_id, (sentence, item) in enumerate(
            zip(original_sentences, segments)
        ):
            if not isinstance(item, dict):
                return [], ChineseBatchValidationResult(
                    accepted=False,
                    reason_code="segment_item_invalid",
                    segment_count=len(segments),
                    details=tuple(details),
                )
            if item.get("id") != expected_id:
                return [], ChineseBatchValidationResult(
                    accepted=False,
                    reason_code="segment_id_mismatch",
                    segment_count=len(segments),
                    details=tuple(details),
                )
            punctuated_source = str(item.get("punctuated_source", ""))
            translation = str(item.get("translation", ""))
            if not punctuated_source or not translation:
                invalid_indexes.append(expected_id)
                details.append(
                    {
                        "id": expected_id,
                        "valid": False,
                        "reason": "segment_fields_missing",
                    }
                )
                updated.append(None)
                continue

            if _hint_token_leaked(punctuated_source):
                details.append(
                    {
                        "id": expected_id,
                        "field": "punctuated_source",
                        "valid": False,
                        "reason": "hint_token_leaked",
                    }
                )
                invalid_indexes.append(expected_id)
                updated.append(None)
                continue
            if _hint_token_leaked(translation):
                details.append(
                    {
                        "id": expected_id,
                        "field": "translation",
                        "valid": False,
                        "reason": "hint_token_leaked",
                    }
                )
                invalid_indexes.append(expected_id)
                updated.append(None)
                continue

            original_canonical = _normalize_for_canonical_match(sentence.text)
            llm_canonical = _normalize_for_canonical_match(punctuated_source)
            detail = {
                "id": expected_id,
                "original_canonical": original_canonical,
                "llm_canonical": llm_canonical,
            }
            if original_canonical != llm_canonical:
                invalid_indexes.append(expected_id)
                detail["valid"] = False
                detail["reason"] = "source_mutation_detected"
                details.append(detail)
                updated.append(None)
                continue
            detail["valid"] = True
            details.append(detail)
            updated_sentence = sentence.model_copy(deep=True)
            updated_sentence.text = punctuated_source
            updated_sentence.translation = translation
            updated.append(updated_sentence)

        if invalid_indexes:
            if len(invalid_indexes) == len(original_sentences):
                first_invalid = next(
                    (detail.get("reason") for detail in details if not detail.get("valid", True)),
                    "segment_invalid",
                )
                return updated, ChineseBatchValidationResult(
                    accepted=False,
                    reason_code=str(first_invalid),
                    segment_count=len(original_sentences),
                    details=tuple(details),
                )
            return updated, ChineseBatchValidationResult(
                accepted=False,
                reason_code="partial_segment_invalid",
                segment_count=len(original_sentences),
                details=tuple(details),
            )

        return updated, ChineseBatchValidationResult(
            accepted=True,
            reason_code="ok",
            segment_count=len(updated),
            details=tuple(details),
        )

    def translate_batch(
        self,
        sentences: Sequence[Sentence],
        *,
        target_lang: str,
        fallback_translate: Callable[[list[str]], list[str]],
        context_before: Sequence[Sentence] | None = None,
        context_after: Sequence[Sentence] | None = None,
        source_lang: str | None = None,
        actual_route: str | None = None,
    ) -> ChineseBatchLLMResult:
        if not sentences:
            return ChineseBatchLLMResult(sentences=(), sub_batches=())

        translated_sentences: list[Sentence] = []
        sub_batch_results: list[ChineseBatchLLMSubBatchResult] = []
        windows = self._target_windows_for_translation(
            sentences,
            source_lang=source_lang,
            actual_route=actual_route,
        )
        shadow = max(0, settings.AI_CHINESE_LLM_RESCUE_SHADOW_SEGMENTS)
        before_context_full = list(context_before or [])
        after_context_full = list(context_after or [])

        for start, end in windows:
            target_sentences = list(sentences[start:end])
            local_before = list(sentences[max(0, start - shadow) : start])
            if not local_before and before_context_full:
                local_before = before_context_full[-shadow:]
            local_after = list(sentences[end : min(len(sentences), end + shadow)])
            if not local_after and after_context_full:
                local_after = after_context_full[:shadow]
            risk = self.assess_batch(
                target_sentences,
                context_before=local_before,
                context_after=local_after,
                source_lang=source_lang,
                actual_route=actual_route,
            )

            if not settings.AI_CHINESE_LLM_RESCUE_ENABLED or not risk.triggered:
                translations = fallback_translate(
                    [sentence.text for sentence in target_sentences]
                )
                fallback_sentences = [
                    sentence.model_copy(deep=True) for sentence in target_sentences
                ]
                for sentence, translation in zip(fallback_sentences, translations):
                    sentence.translation = translation
                translated_sentences.extend(fallback_sentences)
                sub_batch_results.append(
                    ChineseBatchLLMSubBatchResult(
                        sentences=tuple(fallback_sentences),
                        strategy_used="nmt",
                        risk=risk,
                        validation=ChineseBatchValidationResult(
                            accepted=True,
                            reason_code="not_triggered",
                            segment_count=len(fallback_sentences),
                            details=(),
                        ),
                        llm_metadata={},
                    )
                )
                continue

            prompt = self._build_prompt_payload(
                target_sentences,
                context_before=local_before,
                context_after=local_after,
                target_lang=target_lang,
                source_lang=source_lang,
                actual_route=actual_route,
            )
            try:
                llm_text, llm_metadata = self._llm.generate_ollama_structured(
                    prompt,
                    CHINESE_BATCH_LLM_RESCUE_SYSTEM_PROMPT,
                    CHINESE_BATCH_RESCUE_RESPONSE_SCHEMA,
                    model_name=settings.AI_CHINESE_LLM_RESCUE_MODEL,
                    num_ctx=settings.AI_CHINESE_LLM_RESCUE_NUM_CTX,
                    temperature=settings.AI_CHINESE_LLM_RESCUE_TEMPERATURE,
                    keep_alive=settings.AI_CHINESE_LLM_RESCUE_KEEP_ALIVE,
                )
                validated_sentences, validation = self._validate_llm_output(
                    target_sentences,
                    llm_text,
                )
                if validation.accepted:
                    translated_sentences.extend(validated_sentences)
                    sub_batch_results.append(
                        ChineseBatchLLMSubBatchResult(
                            sentences=tuple(validated_sentences),
                            strategy_used="llm_rescue",
                            risk=risk,
                            validation=validation,
                            llm_metadata=llm_metadata,
                        )
                    )
                    continue
                if validation.reason_code == "partial_segment_invalid":
                    invalid_sentences = [
                        target_sentences[index]
                        for index, sentence in enumerate(validated_sentences)
                        if sentence is None
                    ]
                    fallback_translations = fallback_translate(
                        [sentence.text for sentence in invalid_sentences]
                    )
                    fallback_cursor = 0
                    merged_sentences: list[Sentence] = []
                    for index, candidate in enumerate(validated_sentences):
                        if candidate is not None:
                            merged_sentences.append(candidate)
                            continue
                        fallback_sentence = target_sentences[index].model_copy(deep=True)
                        fallback_sentence.translation = fallback_translations[fallback_cursor]
                        fallback_cursor += 1
                        merged_sentences.append(fallback_sentence)
                    translated_sentences.extend(merged_sentences)
                    sub_batch_results.append(
                        ChineseBatchLLMSubBatchResult(
                            sentences=tuple(merged_sentences),
                            strategy_used="llm_rescue_partial",
                            risk=risk,
                            validation=validation,
                            llm_metadata=dict(llm_metadata),
                        )
                    )
                    logger.warning(
                        "Chinese LLM rescue partially accepted batch window {}-{}: {} invalid segment(s)",
                        start,
                        end,
                        len(invalid_sentences),
                    )
                    continue
                logger.warning(
                    "Chinese LLM rescue rejected batch window {}-{}: {}",
                    start,
                    end,
                    validation.reason_code,
                )
            except Exception as exc:
                llm_metadata = {"error": str(exc)}
                validation = ChineseBatchValidationResult(
                    accepted=False,
                    reason_code="llm_request_failed",
                    segment_count=0,
                    details=(),
                )
                logger.warning(
                    "Chinese LLM rescue failed for batch window {}-{}: {}",
                    start,
                    end,
                    exc,
                )

            translations = fallback_translate([sentence.text for sentence in target_sentences])
            fallback_sentences = [
                sentence.model_copy(deep=True) for sentence in target_sentences
            ]
            for sentence, translation in zip(fallback_sentences, translations):
                sentence.translation = translation
            translated_sentences.extend(fallback_sentences)
            sub_batch_results.append(
                ChineseBatchLLMSubBatchResult(
                    sentences=tuple(fallback_sentences),
                    strategy_used="llm_rescue_fallback",
                    risk=risk,
                    validation=validation,
                    llm_metadata=dict(llm_metadata),
                )
            )

        return ChineseBatchLLMResult(
            sentences=tuple(translated_sentences),
            sub_batches=tuple(sub_batch_results),
        )
