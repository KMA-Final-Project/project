import re
import unicodedata
from dataclasses import dataclass, field
from hashlib import sha256
from typing import List

from src.schemas import Sentence


def estimate_source_tokens(text: str) -> int:
    normalized = unicodedata.normalize("NFKC", text)
    latin_chunks = re.findall(r"[A-Za-z0-9]+(?:['_-][A-Za-z0-9]+)*", normalized)
    cjk_chars = re.findall(r"[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]", normalized)
    return max(1, len(latin_chunks) + len(cjk_chars))


@dataclass(slots=True)
class FinalizationWindowPolicy:
    min_segment_count: int
    target_segment_count: int
    max_segment_count: int
    min_source_tokens: int
    target_source_tokens: int
    max_request_tokens: int
    min_duration_seconds: float
    target_duration_seconds: float
    max_duration_seconds: float
    overlap_segments: int
    overlap_source_tokens: int


@dataclass(slots=True)
class FinalizationWindow:
    revision_index: int
    window_start_segment_index: int
    window_end_segment_index: int
    core_start_segment_index: int
    core_end_segment_index: int
    halo_before_sentences: List[Sentence]
    core_sentences: List[Sentence]
    halo_after_sentences: List[Sentence]
    source_token_count: int
    duration_seconds: float
    is_eof_flush: bool
    source_hash: str


@dataclass
class FinalizationWindowBuilder:
    policy: FinalizationWindowPolicy
    _buffer: List[Sentence] = field(default_factory=list)
    _revision_index: int = 0

    def add(self, sentence: Sentence) -> None:
        self._buffer.append(sentence)

    def is_empty(self) -> bool:
        return len(self._buffer) == 0

    def pop_ready_windows(self, eof: bool) -> List[FinalizationWindow]:
        if not self._buffer:
            return []
        if not eof and not self._is_ready():
            return []
        window = self._build_window(is_eof_flush=eof)
        self._trim_buffer(window, drain=eof)
        return [window]

    def _is_ready(self) -> bool:
        segment_count = len(self._buffer)
        token_count = sum(estimate_source_tokens(s.text) for s in self._buffer)
        duration = self._buffer[-1].end - self._buffer[0].start
        density = token_count / max(duration, 0.001)

        if segment_count >= self.policy.max_segment_count:
            return True
        if token_count >= self.policy.max_request_tokens:
            return True

        minimums_met = (
            segment_count >= self.policy.min_segment_count
            and token_count >= self.policy.min_source_tokens
        )
        if not minimums_met:
            return False

        if duration >= self.policy.max_duration_seconds:
            return True
        if segment_count >= self.policy.target_segment_count:
            return True
        if token_count >= self.policy.target_source_tokens:
            return True
        if duration >= self.policy.target_duration_seconds and density >= 0.35:
            return True

        return minimums_met

    def _build_window(self, is_eof_flush: bool) -> FinalizationWindow:
        if is_eof_flush:
            sentences = list(self._buffer)
        else:
            sentences = list(self._buffer[: self.policy.max_segment_count])
        halo_before = [] if self._revision_index == 0 else sentences[: self.policy.overlap_segments]
        core_start_offset = len(halo_before)
        available_for_core = max(0, len(sentences) - core_start_offset)
        core_count = available_for_core if is_eof_flush else min(
            available_for_core,
            self.policy.target_segment_count,
        )
        core_end_offset = core_start_offset + core_count
        core_sentences = sentences[core_start_offset:core_end_offset]
        halo_after = [] if is_eof_flush else sentences[core_end_offset:]
        token_count = sum(estimate_source_tokens(s.text) for s in core_sentences)
        source_hash = sha256(
            "|".join(
                f"{s.segment_index}:{s.start:.3f}:{s.end:.3f}:{unicodedata.normalize('NFKC', s.text)}"
                for s in core_sentences
            ).encode("utf-8")
        ).hexdigest()[:16]
        return FinalizationWindow(
            revision_index=self._revision_index,
            window_start_segment_index=sentences[0].segment_index or 0,
            window_end_segment_index=sentences[-1].segment_index or 0,
            core_start_segment_index=core_sentences[0].segment_index or 0,
            core_end_segment_index=core_sentences[-1].segment_index or 0,
            halo_before_sentences=halo_before,
            core_sentences=core_sentences,
            halo_after_sentences=halo_after,
            source_token_count=token_count,
            duration_seconds=sentences[-1].end - sentences[0].start,
            is_eof_flush=is_eof_flush,
            source_hash=source_hash,
        )

    def _trim_buffer(self, window: FinalizationWindow, drain: bool) -> None:
        self._revision_index += 1
        if drain:
            self._buffer = []
            return
        carry_from_core = (
            window.core_sentences[-self.policy.overlap_segments :]
            if self.policy.overlap_segments > 0
            else []
        )
        consumed = (
            len(window.halo_before_sentences)
            + len(window.core_sentences)
            + len(window.halo_after_sentences)
        )
        remaining_tail = self._buffer[consumed:]
        self._buffer = list(carry_from_core) + list(window.halo_after_sentences) + list(remaining_tail)
