from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Protocol

import numpy as np

from src.schemas import Sentence, VADSegment


@dataclass(frozen=True, slots=True)
class ASRRouteConfig:
    route_id: str
    provider_id: str
    model_id: str
    display_name: str
    worker_modes: frozenset[str]
    fallback_route_ids: tuple[str, ...] = ()
    forced_language: str | None = None
    greedy_only: bool = False
    supports_probe: bool = False
    supports_word_timestamps: bool = True
    during_asr_certified: bool = False
    condition_on_previous_text: bool = False


@dataclass(frozen=True, slots=True)
class ASRRouteDecision:
    route_id: str
    provider_id: str
    model_id: str
    requested_policy: str
    effective_policy: str
    auto_downgraded: bool
    during_asr_certified: bool
    fallback_chain: tuple[str, ...]


class ASRProvider(Protocol):
    route: ASRRouteConfig
    last_timing: dict[str, float]
    last_diagnostics: dict[str, Any]
    last_probe_details: dict[str, Any]

    def ensure_loaded(self) -> None: ...

    def unload(self, *, to_cpu: bool = False) -> None: ...

    def probe_language(
        self,
        file_path: Path | str,
        segments: list[VADSegment],
        *,
        audio_array: np.ndarray | None = None,
        max_segments: int | None = None,
        max_seconds: float | None = None,
    ) -> str | None: ...

    def process(
        self,
        file_path: Path | str,
        segments: list[VADSegment],
        *,
        profile: str,
        on_chunk: Callable[[list[Sentence], int], None] | None,
        chunk_size: int,
        audio_array: np.ndarray | None = None,
        source_language: str | None = None,
    ) -> list[Sentence]: ...

    def healthcheck(self) -> dict[str, Any]: ...
