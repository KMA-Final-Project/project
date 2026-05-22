from __future__ import annotations

from dataclasses import asdict, dataclass
import re
from typing import Any

from loguru import logger

from src.config import settings
from src.core.subtitle_text import canonicalize_non_cjk_text, contains_cjk
from src.schemas import Sentence, Word

_HAN_RE = re.compile(r"[\u4e00-\u9fff]")
_LATIN_RE = re.compile(r"[A-Za-z]")
_ALNUM_RE = re.compile(r"[A-Za-z0-9]")
_MAJOR_PUNCT = {"。", "！", "？", ".", "!", "?"}
_MINOR_PUNCT = {"，", ",", "；", ";", "：", ":", "、"}
_TRAILING_NOISE = {"…", "..."}


@dataclass(slots=True)
class ChinesePrimarySegmentMetrics:
    text: str
    duration_seconds: float
    han_ratio: float
    latin_ratio: float
    sentence_unit_count: int
    low_confidence_word_count: int
    duplicate_score: float
    mixed_language: bool


@dataclass(slots=True)
class ChinesePrimaryRefineResult:
    sentences: list[Sentence]
    dropped_spans: list[dict[str, Any]]
    deduped_spans: list[dict[str, Any]]
    segment_metrics: list[dict[str, Any]]
    normalization_hits: list[str]

    def as_metrics(self) -> dict[str, Any]:
        return {
            "segment_count": len(self.sentences),
            "dropped_spans": list(self.dropped_spans),
            "deduped_spans": list(self.deduped_spans),
            "segment_metrics": list(self.segment_metrics),
            "normalization_hits": list(self.normalization_hits),
        }


@dataclass(slots=True)
class _Clause:
    words: list[Word]
    text: str
    boundary: str
    sentence_units: int


def refine_chinese_primary_transcript(
    sentences: list[Sentence],
) -> ChinesePrimaryRefineResult:
    clauses: list[_Clause] = []
    dropped_spans: list[dict[str, Any]] = []
    normalization_hits: list[str] = []

    for sentence in sentences:
        clauses.extend(
            _split_sentence_into_clauses(
                sentence,
                dropped_spans=dropped_spans,
                normalization_hits=normalization_hits,
            )
        )

    clauses = _drop_adjacent_duplicate_clauses(clauses, dropped_spans)
    refined_sentences = _assemble_segments(clauses)
    deduped_sentences, deduped_spans = _dedupe_nearby_segments(refined_sentences)

    metrics = [_segment_metrics(sentence) for sentence in deduped_sentences]
    logger.info(
        "Chinese-primary post-ASR refine: "
        f"{len(sentences)} -> {len(deduped_sentences)} segments | "
        f"dropped={len(dropped_spans)} deduped={len(deduped_spans)}"
    )
    return ChinesePrimaryRefineResult(
        sentences=deduped_sentences,
        dropped_spans=dropped_spans,
        deduped_spans=deduped_spans,
        segment_metrics=[asdict(metric) for metric in metrics],
        normalization_hits=normalization_hits,
    )


def _split_sentence_into_clauses(
    sentence: Sentence,
    *,
    dropped_spans: list[dict[str, Any]],
    normalization_hits: list[str],
) -> list[_Clause]:
    clauses: list[_Clause] = []
    current: list[Word] = []
    text_overrides = _split_text_clause_overrides(sentence.text)
    override_index = 0
    def flush(boundary: str) -> None:
        nonlocal current, override_index
        if not current:
            return
        text_override = text_overrides[override_index] if override_index < len(text_overrides) else None
        clause = _build_clause(current, boundary, normalization_hits, text_override=text_override)
        current = []
        if text_override is not None:
            override_index += 1
        if clause is None:
            return
        if _should_drop_clause(clause):
            dropped_spans.append(_drop_record(clause, "english_gloss_removed"))
            return
        clauses.append(clause)

    words = list(sentence.words)
    for index, original_word in enumerate(words):
        token = str(original_word.word or "").strip()
        if not token:
            continue
        word = original_word.model_copy(deep=True)
        current.append(word)

        if token in _MAJOR_PUNCT:
            next_script = _next_meaningful_script(words, index + 1)
            if next_script != "latin":
                flush("major")

    flush("sentence_end")
    return clauses


def _build_clause(
    words: list[Word],
    boundary: str,
    normalization_hits: list[str],
    *,
    text_override: str | None = None,
) -> _Clause | None:
    cleaned_words = [word for word in words if str(word.word or "").strip()]
    if not cleaned_words:
        return None
    while cleaned_words and str(cleaned_words[-1].word).strip() in _TRAILING_NOISE:
        cleaned_words.pop()
    if not cleaned_words:
        return None
    text = _prefer_clause_text(
        _build_mixed_text_from_words(cleaned_words).strip(),
        str(text_override or "").strip(),
    )
    if not text:
        return None
    text, hit_labels = _apply_text_normalizations(text)
    normalization_hits.extend(hit_labels)
    _rewrite_words_to_text(cleaned_words, text)
    text = _build_mixed_text_from_words(cleaned_words, override_text=text).strip()
    if not text:
        return None
    return _Clause(
        words=cleaned_words,
        text=text,
        boundary=boundary,
        sentence_units=1 if boundary in {"major", "minor", "sentence_end"} else 0,
    )


def _apply_text_normalizations(text: str) -> tuple[str, list[str]]:
    normalized = text
    hits: list[str] = []
    for source, target in settings.chinese_text_normalization_rules:
        if source not in normalized:
            continue
        if len(source) != len(target):
            continue
        normalized = normalized.replace(source, target)
        hits.append(f"{source}->{target}")
    return normalized, hits


def _should_drop_clause(clause: _Clause) -> bool:
    if _han_ratio(clause.text) > 0:
        return False
    latin_tokens = _latin_tokens(clause.text)
    if not latin_tokens:
        return False
    if not settings.AI_CHINESE_DROP_ENGLISH_GLOSS:
        return False
    avg_confidence = _average_confidence(clause.words)
    duration_seconds = _duration_seconds(clause.words)
    normalized = _normalized_text(clause.text)
    repetition = _repetition_score(clause.text)
    if normalized in {token.lower() for token in settings.chinese_dedupe_short_phrases}:
        return False
    return (
        avg_confidence < 0.12
        or duration_seconds <= 0.12
        or (repetition >= 0.8 and avg_confidence < 0.4)
    )


def _drop_adjacent_duplicate_clauses(
    clauses: list[_Clause],
    dropped_spans: list[dict[str, Any]],
) -> list[_Clause]:
    if not clauses:
        return []
    kept: list[_Clause] = [clauses[0]]
    for clause in clauses[1:]:
        previous = kept[-1]
        if _normalized_text(previous.text) == _normalized_text(clause.text):
            dropped_spans.append(_drop_record(clause, "adjacent_duplicate_clause"))
            continue
        kept.append(clause)
    return kept


def _assemble_segments(clauses: list[_Clause]) -> list[Sentence]:
    if not clauses:
        return []

    segments: list[Sentence] = []
    current_words: list[Word] = []
    current_texts: list[str] = []
    current_units = 0

    def flush() -> None:
        nonlocal current_words, current_texts, current_units
        if not current_words:
            return
        text = _join_clause_texts(current_texts).strip()
        if not text:
            current_words = []
            current_texts = []
            current_units = 0
            return
        segments.append(
            Sentence(
                text=text,
                start=current_words[0].start,
                end=current_words[-1].end,
                words=[word.model_copy(deep=True) for word in current_words],
                detected_lang="zh",
            )
        )
        current_words = []
        current_texts = []
        current_units = 0

    for clause in clauses:
        if not clause.words:
            continue
        projected_words = current_words + clause.words
        projected_text = _join_clause_texts([*current_texts, clause.text]).strip()
        projected_duration = clause.words[-1].end - projected_words[0].start
        projected_han_chars = sum(1 for char in projected_text if _HAN_RE.search(char))
        projected_units = current_units + max(clause.sentence_units, 1)

        if current_words and (
            projected_duration > settings.AI_CHINESE_MAX_SEGMENT_SECONDS
            or projected_han_chars > settings.AI_CHINESE_MAX_SEGMENT_HAN_CHARS
            or projected_units > settings.AI_CHINESE_MAX_SEGMENT_SENTENCE_UNITS
        ):
            flush()

        current_words.extend(word.model_copy(deep=True) for word in clause.words)
        current_texts.append(clause.text)
        current_units += max(clause.sentence_units, 1)

        if clause.boundary in {"major", "sentence_end"}:
            flush()

    flush()
    return segments


def _dedupe_nearby_segments(
    sentences: list[Sentence],
) -> tuple[list[Sentence], list[dict[str, Any]]]:
    kept: list[Sentence] = []
    deduped: list[dict[str, Any]] = []
    for sentence in sentences:
        if kept:
            previous = kept[-1]
            time_gap = sentence.start - previous.end
            similarity = _text_similarity(previous.text, sentence.text)
            if (
                _eligible_for_dedupe(sentence.text)
                and _eligible_for_dedupe(previous.text)
                and time_gap <= settings.AI_CHINESE_DUPLICATE_TIME_WINDOW_SECONDS
                and similarity >= settings.AI_CHINESE_DUPLICATE_SIMILARITY
            ):
                deduped.append(
                    {
                        "reason": "nearby_duplicate_segment",
                        "text": sentence.text,
                        "start": sentence.start,
                        "end": sentence.end,
                        "similarity": round(similarity, 4),
                    }
                )
                continue
        kept.append(sentence)
    return kept, deduped


def _segment_metrics(sentence: Sentence) -> ChinesePrimarySegmentMetrics:
    text = sentence.text
    normalized = _normalized_text(text)
    low_confidence_count = sum(
        1
        for word in sentence.words
        if float(word.confidence or 0.0) < settings.AI_CHINESE_LOW_CONFIDENCE_WORD_THRESHOLD
    )
    duplicate_score = 1.0 - (
        len(set(_latin_tokens(normalized) or list(normalized)))
        / max(len(_latin_tokens(normalized) or list(normalized)), 1)
    )
    return ChinesePrimarySegmentMetrics(
        text=text,
        duration_seconds=round(sentence.end - sentence.start, 4),
        han_ratio=round(_han_ratio(text), 4),
        latin_ratio=round(_latin_ratio(text), 4),
        sentence_unit_count=max(1, text.count("。") + text.count("？") + text.count("！")),
        low_confidence_word_count=low_confidence_count,
        duplicate_score=round(max(0.0, duplicate_score), 4),
        mixed_language=contains_cjk(text) and bool(_LATIN_RE.search(text)),
    )


def _drop_record(clause: _Clause, reason: str) -> dict[str, Any]:
    return {
        "reason": reason,
        "text": clause.text,
        "start": clause.words[0].start if clause.words else 0.0,
        "end": clause.words[-1].end if clause.words else 0.0,
    }


def _token_script(token: str) -> str:
    if _HAN_RE.search(token):
        return "han"
    if _LATIN_RE.search(token):
        return "latin"
    if token in _MAJOR_PUNCT or token in _MINOR_PUNCT or not _ALNUM_RE.search(token):
        return "punct"
    return "other"

def _latin_tokens(text: str) -> list[str]:
    return re.findall(r"[A-Za-z]+(?:['’-][A-Za-z]+)?", text)


def _normalized_text(text: str) -> str:
    return re.sub(r"[\s\W_]+", "", text).lower()


def _text_similarity(left: str, right: str) -> float:
    norm_left = _normalized_text(left)
    norm_right = _normalized_text(right)
    if not norm_left or not norm_right:
        return 0.0
    if norm_left == norm_right:
        return 1.0
    left_bigrams = {norm_left[index : index + 2] for index in range(max(len(norm_left) - 1, 1))}
    right_bigrams = {norm_right[index : index + 2] for index in range(max(len(norm_right) - 1, 1))}
    union = left_bigrams | right_bigrams
    if not union:
        return 0.0
    return len(left_bigrams & right_bigrams) / len(union)


def _next_meaningful_script(words: list[Word], start_index: int) -> str:
    for word in words[start_index:]:
        token = str(word.word or "").strip()
        if not token:
            continue
        script = _token_script(token)
        if script != "punct":
            return script
    return ""


def _build_mixed_text_from_words(
    words: list[Word],
    *,
    override_text: str | None = None,
) -> str:
    if override_text is not None:
        return override_text
    segments: list[tuple[str, str]] = []
    latin_tokens: list[str] = []

    def flush_latin() -> None:
        nonlocal latin_tokens
        if not latin_tokens:
            return
        segments.append(("latin", canonicalize_non_cjk_text(" ".join(latin_tokens))))
        latin_tokens = []

    for word in words:
        token = str(word.word or "").strip()
        if not token:
            continue
        script = _token_script(token)
        if script == "latin":
            latin_tokens.append(token)
            continue
        flush_latin()
        segments.append((script, token))
    flush_latin()

    result = ""
    for kind, token in segments:
        if not token:
            continue
        if kind == "latin":
            if result and not result.endswith(" ") and result[-1] not in _MAJOR_PUNCT and result[-1] not in _MINOR_PUNCT:
                result += " "
            result += token
            continue
        if kind == "han" and result and result[-1].isascii() and result[-1].isalnum():
            result += " "
        result += token
    return result.strip()


def _join_clause_texts(texts: list[str]) -> str:
    result = ""
    for text in texts:
        token = str(text or "").strip()
        if not token:
            continue
        if not result:
            result = token
            continue
        if (
            result[-1] not in _MAJOR_PUNCT
            and result[-1] not in _MINOR_PUNCT
            and (
                (_HAN_RE.search(result[-1]) and _LATIN_RE.search(token[0]))
                or (result[-1].isascii() and result[-1].isalnum() and _HAN_RE.search(token[0]))
                or (result[-1].isascii() and result[-1].isalnum() and token[0].isascii() and token[0].isalnum())
            )
        ):
            result += " "
        result += token
    return result


def _split_text_clause_overrides(text: str) -> list[str]:
    normalized = str(text or "").strip()
    if not normalized:
        return []
    parts: list[str] = []
    current = ""
    for index, char in enumerate(normalized):
        current += char
        if char not in _MAJOR_PUNCT:
            continue
        next_script = _next_meaningful_char_script(normalized, index + 1)
        if next_script == "latin":
            continue
        token = current.strip()
        if token:
            parts.append(token)
        current = ""
    tail = current.strip()
    if tail:
        parts.append(tail)
    return parts


def _next_meaningful_char_script(text: str, start_index: int) -> str:
    for char in text[start_index:]:
        if char.isspace():
            continue
        if _LATIN_RE.search(char):
            return "latin"
        if _HAN_RE.search(char):
            return "han"
        if char in _MAJOR_PUNCT or char in _MINOR_PUNCT:
            continue
        return ""
    return ""


def _prefer_clause_text(rebuilt: str, override: str) -> str:
    if not override:
        return rebuilt
    if not rebuilt:
        return override
    if _LATIN_RE.search(override) and " " in override and " " in rebuilt:
        rebuilt_tokens = [token for token in rebuilt.split() if token.isalpha() and len(token) == 1]
        if len(rebuilt_tokens) >= 4:
            return override
    if len(override) >= len(rebuilt) and _LATIN_RE.search(override):
        return override
    return rebuilt


def _eligible_for_dedupe(text: str) -> bool:
    normalized = _normalized_text(text)
    if len(normalized) < settings.AI_CHINESE_DEDUPE_MIN_NORMALIZED_CHARS:
        return False
    if normalized in {token.lower() for token in settings.chinese_dedupe_short_phrases}:
        return False
    return True


def _repetition_score(text: str) -> float:
    latin_tokens = _latin_tokens(text.lower())
    if len(latin_tokens) < 4:
        return 0.0
    unique = len(set(latin_tokens))
    return 1.0 - (unique / len(latin_tokens))


def _rewrite_words_to_text(words: list[Word], text: str) -> None:
    compact_text = text.replace(" ", "")
    token_lengths = [len(str(word.word or "")) for word in words]
    if sum(token_lengths) != len(compact_text):
        return
    cursor = 0
    for word, length in zip(words, token_lengths, strict=False):
        word.word = compact_text[cursor : cursor + length]
        cursor += length


def _duration_seconds(words: list[Word]) -> float:
    if not words:
        return 0.0
    return max(0.0, float(words[-1].end) - float(words[0].start))


def _average_confidence(words: list[Word]) -> float:
    if not words:
        return 0.0
    return sum(float(word.confidence or 0.0) for word in words) / len(words)


def _han_ratio(text: str) -> float:
    if not text:
        return 0.0
    return sum(1 for char in text if _HAN_RE.search(char)) / len(text)


def _latin_ratio(text: str) -> float:
    if not text:
        return 0.0
    return sum(1 for char in text if _LATIN_RE.search(char)) / len(text)
