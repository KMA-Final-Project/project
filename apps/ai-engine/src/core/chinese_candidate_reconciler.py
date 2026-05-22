from __future__ import annotations

from dataclasses import asdict, dataclass
import re
from typing import Any

from src.config import settings
from src.schemas import Sentence

_HAN_RE = re.compile(r"[\u4e00-\u9fff]")
_LATIN_TOKEN_RE = re.compile(r"[A-Za-z]+(?:['’-][A-Za-z]+)?")
_NOISE_RE = re.compile(r"[\s\W_]+")
_GREETING_HINTS = ("你好", "您好", "幸会", "請問", "请问")


@dataclass(slots=True)
class CandidateSnapshot:
    route: str
    provider: str
    sentences: list[Sentence]


@dataclass(slots=True)
class ChineseCandidateReconcileResult:
    sentences: list[Sentence]
    replacements: list[dict[str, Any]]

    def as_metrics(self) -> dict[str, Any]:
        return {
            "replacement_count": len(self.replacements),
            "replacements": list(self.replacements),
        }


def reconcile_chinese_candidate_sentences(
    trusted_sentences: list[Sentence],
    alternate_candidates: list[CandidateSnapshot],
) -> ChineseCandidateReconcileResult:
    if not trusted_sentences or not alternate_candidates:
        return ChineseCandidateReconcileResult(
            sentences=[sentence.model_copy(deep=True) for sentence in trusted_sentences],
            replacements=[],
        )

    reconciled = [sentence.model_copy(deep=True) for sentence in trusted_sentences]
    replacements: list[dict[str, Any]] = []

    for candidate in alternate_candidates:
        if not candidate.sentences:
            continue
        for alternate in candidate.sentences:
            if alternate.start > settings.AI_CHINESE_RECONCILE_EARLY_WINDOW_SECONDS:
                break
            overlap_indexes = [
                index
                for index, trusted in enumerate(reconciled)
                if _overlap_seconds(trusted, alternate)
                >= settings.AI_CHINESE_RECONCILE_MIN_OVERLAP_SECONDS
            ]
            if not overlap_indexes:
                continue
            first = overlap_indexes[0]
            last = overlap_indexes[-1]
            base_group = reconciled[first : last + 1]
            if not _should_replace_group(base_group, alternate):
                continue
            replacements.append(
                {
                    "reason": "early_candidate_patch",
                    "route": candidate.route,
                    "provider": candidate.provider,
                    "replacement_text": alternate.text,
                    "replaced_texts": [sentence.text for sentence in base_group],
                    "start": alternate.start,
                    "end": alternate.end,
                }
            )
            reconciled = (
                reconciled[:first]
                + [alternate.model_copy(deep=True)]
                + reconciled[last + 1 :]
            )

    return ChineseCandidateReconcileResult(
        sentences=reconciled,
        replacements=replacements,
    )


def _should_replace_group(base_group: list[Sentence], alternate: Sentence) -> bool:
    alternate_text = str(alternate.text or "").strip()
    alternate_norm = _normalized_text(alternate_text)
    if not alternate_norm:
        return False
    if _average_confidence(alternate) < settings.AI_CHINESE_RECONCILE_MIN_AVG_CONFIDENCE:
        return False

    base_text = " ".join(sentence.text for sentence in base_group).strip()
    base_norm = _normalized_text(base_text)
    base_score = _content_score(base_group)
    alternate_score = _content_score([alternate])

    alternate_contains_base = bool(base_norm) and alternate_norm.find(base_norm) >= 0
    base_contains_alternate = bool(base_norm) and base_norm.find(alternate_norm) >= 0
    mixed_upgrade = _mixed_script_score(alternate_text) > _mixed_script_score(base_text)
    greeting_upgrade = _greeting_hint_score(alternate_text) > _greeting_hint_score(base_text)
    earlier_start = alternate.start + 0.2 < base_group[0].start

    if alternate_contains_base and alternate_score >= base_score:
        return True
    if mixed_upgrade and alternate_score >= base_score:
        return True
    if greeting_upgrade and alternate_score >= base_score:
        return True
    if earlier_start and alternate_score >= (base_score + settings.AI_CHINESE_RECONCILE_REPLACE_SCORE_MARGIN):
        return True
    if not base_contains_alternate and alternate_score >= (base_score + settings.AI_CHINESE_RECONCILE_REPLACE_SCORE_MARGIN):
        return True
    return False


def _overlap_seconds(left: Sentence, right: Sentence) -> float:
    return max(0.0, min(left.end, right.end) - max(left.start, right.start))


def _normalized_text(text: str) -> str:
    return _NOISE_RE.sub("", text).lower()


def _average_confidence(sentence: Sentence) -> float:
    if not sentence.words:
        return 0.0
    return sum(float(word.confidence or 0.0) for word in sentence.words) / len(sentence.words)


def _content_score(sentences: list[Sentence]) -> float:
    text = " ".join(sentence.text for sentence in sentences).strip()
    normalized = _normalized_text(text)
    if not normalized:
        return 0.0
    score = float(len(normalized))
    score += float(_mixed_script_score(text))
    score += float(_greeting_hint_score(text))
    low_confidence_penalty = 0.0
    confidences = [
        float(word.confidence or 0.0)
        for sentence in sentences
        for word in sentence.words
    ]
    if confidences:
        avg_confidence = sum(confidences) / len(confidences)
        if avg_confidence < settings.AI_CHINESE_RECONCILE_MIN_AVG_CONFIDENCE:
            low_confidence_penalty = 4.0
    return score - low_confidence_penalty


def _mixed_script_score(text: str) -> int:
    has_han = bool(_HAN_RE.search(text))
    has_latin = bool(_LATIN_TOKEN_RE.search(text))
    if has_han and has_latin:
        return 8
    return 0


def _greeting_hint_score(text: str) -> int:
    normalized = str(text or "")
    return sum(3 for hint in _GREETING_HINTS if hint in normalized)
