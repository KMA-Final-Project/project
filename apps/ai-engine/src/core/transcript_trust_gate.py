from __future__ import annotations

from dataclasses import asdict, dataclass
import math
import re
from typing import Any

from src.config import settings
from src.core.chinese_prior import ChineseRoutePrior
from src.core.chinese_window_profiler import ChineseTranscriptWindow
from src.schemas import Sentence

_HAN_RE = re.compile(r"[\u4e00-\u9fff]")
_LATIN_RE = re.compile(r"[A-Za-z]")
_ALPHA_TOKEN_RE = re.compile(r"[A-Za-z]+")
_PUNCT_RE = re.compile(r"[.,!?;:，。！？；：…]+")
_COMMON_PINYIN = {
    "a", "ai", "an", "ang", "ba", "bei", "ben", "bu", "de", "dui", "ge", "gong",
    "guo", "hao", "hen", "huan", "hui", "jia", "jian", "jin", "jing", "kan", "ke",
    "la", "le", "li", "ma", "mei", "men", "ming", "na", "ne", "ni", "nin", "peng",
    "qi", "qing", "qu", "ren", "ri", "shi", "ta", "ting", "wan", "wo", "xian",
    "xiang", "xie", "yao", "ye", "yi", "yin", "ying", "you", "zai", "zhe", "zhong",
    "zi", "zou", "zuo",
}


@dataclass(frozen=True, slots=True)
class TranscriptTrustSignals:
    han_ratio: float
    early_han_ratio: float
    latin_ratio: float
    pinyin_like_ratio: float
    avg_word_confidence: float
    avg_logprob: float | None
    compression_ratio: float | None
    lexical_diversity: float
    repetition_score: float
    punctuation_density: float
    text_density: float
    route_is_english: bool
    route_mismatch: bool
    probe_near_tie: bool
    probe_supports_chinese: bool
    sentence_count: int
    total_chars: int
    mixed_window_count: int
    max_window_repetition: float
    max_window_latin_ratio: float


@dataclass(frozen=True, slots=True)
class TranscriptTrustDecision:
    verdict: str
    owner_score: float
    cleanliness_score: float
    suspicious_score: float
    reasons: tuple[str, ...]
    owner_reasons: tuple[str, ...]
    cleanliness_reasons: tuple[str, ...]
    force_after_asr: bool
    publication_blocked: bool
    publish_ready: bool
    ownership_trusted: bool
    repair_window_indexes: tuple[int, ...]
    signals: TranscriptTrustSignals
    window_metrics: tuple[dict[str, Any], ...]

    def as_metrics(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["signals"] = asdict(self.signals)
        payload["window_metrics"] = [dict(window) for window in self.window_metrics]
        return payload


class ChineseTrustGateError(RuntimeError):
    def __init__(self, message: str, payload: dict[str, Any]) -> None:
        super().__init__(message)
        self.payload = payload


class ChineseTranscriptTrustGate:
    def evaluate(
        self,
        *,
        prior: ChineseRoutePrior,
        sentences: list[Sentence],
        route_id: str,
        diagnostics: dict[str, Any] | None,
        probe_details: dict[str, Any] | None,
        stage: str,
        duration_seconds: float,
        windows: list[ChineseTranscriptWindow] | None = None,
    ) -> TranscriptTrustDecision:
        diagnostics = diagnostics or {}
        windows = windows or []
        probe_scores = {
            settings.normalize_language_tag(lang): float(value)
            for lang, value in ((probe_details or {}).get("scores") or {}).items()
            if settings.normalize_language_tag(lang)
        }
        signals = self._build_signals(
            prior=prior,
            sentences=sentences,
            route_id=route_id,
            diagnostics=diagnostics,
            probe_scores=probe_scores,
            duration_seconds=duration_seconds,
            windows=windows,
        )

        owner_score = 0.0
        owner_reasons: list[str] = []
        cleanliness_score = 0.0
        cleanliness_reasons: list[str] = []
        repair_window_indexes: list[int] = []

        if signals.route_mismatch:
            owner_score += 1.0
            owner_reasons.append("route_mismatch")
        if signals.probe_near_tie:
            owner_score += settings.AI_CHINESE_TRUST_PROBE_NEAR_TIE_WEIGHT
            owner_reasons.append("probe_near_tie")
        if signals.probe_supports_chinese and signals.route_is_english and signals.han_ratio < settings.AI_CHINESE_MIN_HAN_RATIO:
            owner_score += 1.1
            owner_reasons.append("probe_transcript_conflict")
        if signals.han_ratio < settings.AI_CHINESE_MIN_HAN_RATIO:
            owner_score += 1.0
            owner_reasons.append("low_han_ratio")
        if signals.early_han_ratio < settings.AI_CHINESE_MIN_EARLY_HAN_RATIO:
            owner_score += 0.8
            owner_reasons.append("low_early_han_ratio")
        if signals.pinyin_like_ratio > settings.AI_CHINESE_MAX_PINYIN_RATIO:
            owner_score += 0.6
            owner_reasons.append("pinyin_like")

        if (
            signals.avg_logprob is not None
            and signals.avg_logprob < settings.AI_CHINESE_MIN_AVG_LOGPROB
        ):
            cleanliness_score += 0.8
            cleanliness_reasons.append("low_avg_logprob")
        if signals.avg_word_confidence < settings.AI_CHINESE_MIN_AVG_WORD_CONFIDENCE:
            cleanliness_score += 0.5
            cleanliness_reasons.append("low_avg_confidence")
        if signals.lexical_diversity < settings.AI_CHINESE_MIN_LEXICAL_DIVERSITY:
            cleanliness_score += 0.5
            cleanliness_reasons.append("low_lexical_diversity")
        if not (
            settings.AI_CHINESE_DURATION_TEXT_DENSITY_MIN
            <= signals.text_density
            <= settings.AI_CHINESE_DURATION_TEXT_DENSITY_MAX
        ):
            cleanliness_score += 0.4
            cleanliness_reasons.append("abnormal_text_density")
        if signals.punctuation_density > 0.3:
            cleanliness_score += 0.3
            cleanliness_reasons.append("abnormal_punctuation")

        for window in windows:
            repetition_limit = settings.AI_CHINESE_MAX_REPETITION_SCORE
            if window.mixed_script:
                repetition_limit *= settings.AI_CHINESE_MIXED_WINDOW_REPETITION_MULTIPLIER
            if window.repetition_score > repetition_limit:
                cleanliness_score += 0.6
                cleanliness_reasons.append(f"window_{window.index}_repetition")
                repair_window_indexes.append(window.index)
            if (
                window.mixed_script
                and window.code_switch_density >= settings.AI_CHINESE_WINDOW_CODE_SWITCH_SHIFT
                and window.latin_ratio > 0.25
                and window.repetition_score <= repetition_limit
            ):
                continue
            if (
                not window.mixed_script
                and window.latin_ratio > 0.55
                and signals.probe_supports_chinese
            ):
                cleanliness_score += 0.4
                cleanliness_reasons.append(f"window_{window.index}_latin_heavy")
                repair_window_indexes.append(window.index)

        owner_score = round(owner_score, 3)
        cleanliness_score = round(cleanliness_score, 3)
        suspicious_score = round(owner_score + cleanliness_score, 3)
        repair_window_indexes = sorted(set(repair_window_indexes))

        if stage == "whisper_full_recovery" and owner_score >= settings.AI_CHINESE_TRUST_OWNER_SUSPICIOUS_SCORE:
            verdict = "untrusted_fail"
        elif owner_score >= settings.AI_CHINESE_TRUST_OWNER_SUSPICIOUS_SCORE:
            verdict = "suspicious_recover"
        elif cleanliness_score >= settings.AI_CHINESE_TRUST_REPAIR_SCORE:
            verdict = "trusted_repair"
        else:
            verdict = "trusted"

        blocked = settings.AI_CHINESE_HOLD_UNVERIFIED_CHUNKS and verdict != "trusted"
        return TranscriptTrustDecision(
            verdict=verdict,
            owner_score=owner_score,
            cleanliness_score=cleanliness_score,
            suspicious_score=suspicious_score,
            reasons=tuple(owner_reasons + cleanliness_reasons),
            owner_reasons=tuple(owner_reasons),
            cleanliness_reasons=tuple(cleanliness_reasons),
            force_after_asr=settings.AI_CHINESE_FORCE_AFTER_ASR_ON_RECOVERY
            and verdict != "trusted",
            publication_blocked=blocked,
            publish_ready=verdict == "trusted",
            ownership_trusted=verdict in {"trusted", "trusted_repair"},
            repair_window_indexes=tuple(repair_window_indexes),
            signals=signals,
            window_metrics=tuple(window.as_metrics() for window in windows),
        )

    def _build_signals(
        self,
        *,
        prior: ChineseRoutePrior,
        sentences: list[Sentence],
        route_id: str,
        diagnostics: dict[str, Any],
        probe_scores: dict[str, float],
        duration_seconds: float,
        windows: list[ChineseTranscriptWindow],
    ) -> TranscriptTrustSignals:
        text = " ".join(sentence.text for sentence in sentences).strip()
        early_sentences = sentences[: settings.AI_CHINESE_TRUST_EARLY_WINDOW_SENTENCES]
        early_text = " ".join(sentence.text for sentence in early_sentences).strip()
        total_chars = max(len(text), 1)
        duration = max(float(duration_seconds or 0.0), 1.0)

        alpha_tokens = _ALPHA_TOKEN_RE.findall(text.lower())
        unique_tokens = {token for token in alpha_tokens if token}
        token_count = len(alpha_tokens)
        lexical_diversity = len(unique_tokens) / token_count if token_count else 1.0
        pinyin_tokens = sum(1 for token in alpha_tokens if token in _COMMON_PINYIN)
        pinyin_like_ratio = pinyin_tokens / token_count if token_count else 0.0

        words = [word for sentence in sentences for word in sentence.words]
        avg_confidence = (
            sum(float(word.confidence or 0.0) for word in words) / len(words)
            if words
            else 0.0
        )

        return TranscriptTrustSignals(
            han_ratio=_char_ratio(text, _HAN_RE),
            early_han_ratio=_char_ratio(early_text, _HAN_RE),
            latin_ratio=_char_ratio(text, _LATIN_RE),
            pinyin_like_ratio=pinyin_like_ratio,
            avg_word_confidence=round(avg_confidence, 4),
            avg_logprob=_safe_float(diagnostics.get("avg_logprob")),
            compression_ratio=_safe_float(diagnostics.get("compression_ratio")),
            lexical_diversity=round(lexical_diversity, 4),
            repetition_score=round(_repetition_score(text), 4),
            punctuation_density=round(_char_ratio(text, _PUNCT_RE), 4),
            text_density=round(len(text) / duration, 4),
            route_is_english=route_id == "distil_whisper_en",
            route_mismatch=prior.should_gate and route_id == "distil_whisper_en",
            probe_near_tie=prior.probe_near_tie,
            probe_supports_chinese=any(lang in {"zh", "yue"} for lang in probe_scores),
            sentence_count=len(sentences),
            total_chars=total_chars,
            mixed_window_count=sum(1 for window in windows if window.mixed_script),
            max_window_repetition=max((window.repetition_score for window in windows), default=0.0),
            max_window_latin_ratio=max((window.latin_ratio for window in windows), default=0.0),
        )


def _char_ratio(text: str, pattern: re.Pattern[str]) -> float:
    if not text:
        return 0.0
    return sum(1 for char in text if pattern.search(char)) / len(text)


def _repetition_score(text: str) -> float:
    tokens = [token for token in _ALPHA_TOKEN_RE.findall(text.lower()) if token]
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


def _safe_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(numeric) or math.isinf(numeric):
        return None
    return round(numeric, 4)
