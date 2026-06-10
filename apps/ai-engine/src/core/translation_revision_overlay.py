from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List

_DISALLOWED_FIELDS = frozenset({"text", "start", "end", "words", "phonetic", "detected_lang"})


@dataclass(frozen=True, slots=True)
class OverlayCandidate:
    segment_index: int
    translation: str
    revision_index: int
    in_core: bool
    validation_score: float


@dataclass(frozen=True, slots=True)
class ValidationResult:
    status: str
    accepted_segments: List[dict]
    failure_reason: str | None = None


def choose_best_translation(
    candidates: Iterable[OverlayCandidate], fallback_translation: str
) -> str:
    ranked = sorted(
        candidates,
        key=lambda c: (c.in_core, c.validation_score, c.revision_index),
        reverse=True,
    )
    if not ranked:
        return fallback_translation
    if len(ranked) >= 2:
        left, right = ranked[0], ranked[1]
        if (
            left.in_core == right.in_core
            and abs(left.validation_score - right.validation_score) < 1e-6
            and left.translation != right.translation
        ):
            return fallback_translation
    return ranked[0].translation


class TranslationRevisionOverlay:
    def validate_response_payload(
        self, expected_indexes: List[int], payload_segments: List[dict]
    ) -> ValidationResult:
        accepted: List[dict] = []
        if len(payload_segments) != len(expected_indexes):
            return ValidationResult(
                status="invalid",
                accepted_segments=[],
                failure_reason="segment_count_mismatch",
            )
        for expected, item in zip(expected_indexes, payload_segments):
            leaked_fields = _DISALLOWED_FIELDS.intersection(item.keys())
            if leaked_fields:
                return ValidationResult(
                    status="invalid",
                    accepted_segments=[],
                    failure_reason="disallowed_source_mutation_fields",
                )
            if item.get("segment_index") != expected:
                return ValidationResult(
                    status="invalid",
                    accepted_segments=[],
                    failure_reason="segment_index_mismatch",
                )
            translation = str(item.get("translation", "")).strip()
            if not translation:
                continue
            accepted.append({"segment_index": expected, "translation": translation})
        status = "valid" if len(accepted) == len(expected_indexes) else "partial"
        return ValidationResult(
            status=status,
            accepted_segments=accepted,
            failure_reason=None,
        )

    def apply_translations(
        self, base_segments: List[dict], candidates: Dict[int, List[OverlayCandidate]]
    ) -> List[dict]:
        merged: List[dict] = []
        for segment in base_segments:
            copied = dict(segment)
            segment_index = copied["segment_index"]
            copied["translation"] = choose_best_translation(
                candidates.get(segment_index, []),
                fallback_translation=copied["translation"],
            )
            merged.append(copied)
        return merged
