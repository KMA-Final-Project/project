"""
Smart Aligner facade
====================

The public API stays stable for the pipeline:
  - route selection
  - source-language probing
  - transcription with word timestamps
  - explicit load/unload hooks

Internally V2.2 moves model-specific logic behind ASR providers so English,
Chinese, and fallback routes can evolve independently without changing the
`Sentence` / `Word` contract.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Callable

import numpy as np
from loguru import logger

from src.config import settings
from src.core.asr.base import ASRProvider, ASRRouteConfig, ASRRouteDecision
from src.core.asr.providers.paraformer_provider import ParaformerZhASRProvider
from src.core.asr.providers.sensevoice_provider import SenseVoiceASRProvider
from src.core.asr.providers.whisper_provider import WhisperASRProvider
from src.core.asr.router import ASRRouter
from src.schemas import Sentence, VADSegment


class SmartAligner:
    _instance = None
    _initialized = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(SmartAligner, cls).__new__(cls)
        return cls._instance

    def __init__(self):
        if SmartAligner._initialized:
            return

        SmartAligner._initialized = True
        self.last_timing: dict[str, float] = {}
        self.last_route_usage: dict[str, Any] = {}
        self.last_probe_details: dict[str, Any] = {}
        route_configs = self._build_route_configs()
        self._router = ASRRouter(route_configs)
        self._providers = self._build_providers(route_configs)
        logger.success(
            "SmartAligner ready | "
            f"routes={list(route_configs)} | mode={settings.WORKER_MODEL_MODE.lower()} | "
            f"translation_default={settings.translation_start_policy}"
        )

    def _build_route_configs(self) -> dict[str, ASRRouteConfig]:
        certified_routes = settings.asr_during_asr_certified_routes
        return {
            "distil_whisper_en": ASRRouteConfig(
                route_id="distil_whisper_en",
                provider_id="whisper",
                model_id=settings.WHISPER_MODEL_DISTIL_EN,
                display_name="Distil-Whisper English",
                worker_modes=frozenset({"auto", "turbo_only"}),
                fallback_route_ids=("whisper_turbo",),
                forced_language="en",
                greedy_only=False,
                supports_probe=False,
                during_asr_certified="distil_whisper_en" in certified_routes,
            ),
            "whisper_turbo": ASRRouteConfig(
                route_id="whisper_turbo",
                provider_id="whisper",
                model_id=settings.WHISPER_MODEL_TURBO,
                display_name="Whisper Turbo",
                worker_modes=frozenset({"auto", "turbo_only"}),
                fallback_route_ids=(),
                greedy_only=True,
                supports_probe=True,
                during_asr_certified="whisper_turbo" in certified_routes,
            ),
            "whisper_full": ASRRouteConfig(
                route_id="whisper_full",
                provider_id="whisper",
                model_id=settings.WHISPER_MODEL_FULL,
                display_name="Whisper Full",
                worker_modes=frozenset({"auto", "full_only"}),
                fallback_route_ids=("whisper_turbo",),
                greedy_only=False,
                supports_probe=False,
                during_asr_certified="whisper_full" in certified_routes,
            ),
            "sensevoice_small": ASRRouteConfig(
                route_id="sensevoice_small",
                provider_id="sensevoice",
                model_id=settings.FUNASR_SENSEVOICE_MODEL,
                display_name="SenseVoice Small",
                worker_modes=frozenset({"auto", "full_only"}),
                fallback_route_ids=("whisper_full",),
                forced_language="zh",
                supports_probe=False,
                during_asr_certified="sensevoice_small" in certified_routes,
            ),
            "paraformer_zh": ASRRouteConfig(
                route_id="paraformer_zh",
                provider_id="paraformer",
                model_id=settings.FUNASR_PARAFORMER_ZH_MODEL,
                display_name="Paraformer Chinese",
                worker_modes=frozenset({"auto", "full_only"}),
                fallback_route_ids=("whisper_full",),
                forced_language="zh",
                supports_probe=False,
                during_asr_certified="paraformer_zh" in certified_routes,
            ),
        }

    @staticmethod
    def _build_providers(
        route_configs: dict[str, ASRRouteConfig],
    ) -> dict[str, ASRProvider]:
        providers: dict[str, ASRProvider] = {}
        for route_id, route in route_configs.items():
            if route.provider_id == "whisper":
                providers[route_id] = WhisperASRProvider(route)
            elif route.provider_id == "sensevoice":
                providers[route_id] = SenseVoiceASRProvider(route)
            elif route.provider_id == "paraformer":
                providers[route_id] = ParaformerZhASRProvider(route)
            else:
                raise ValueError(f"Unsupported ASR provider: {route.provider_id}")
        return providers

    def route_for_language(self, language: str | None) -> str:
        return self._router.route_for_language(language)

    def resolve_route(self, route: str) -> str:
        return self._router.resolve_route(route)

    def route_decision_for_language(
        self,
        language: str | None,
        *,
        requested_policy: str,
        route_override: str | None = None,
    ) -> ASRRouteDecision:
        return self._router.decision_for_language(
            language,
            requested_policy=requested_policy,
            route_override=route_override,
        )

    def get_route_config(self, route: str) -> ASRRouteConfig:
        return self._router.routes[self.resolve_route(route)]

    def prewarm_route_ids(self) -> tuple[str, ...]:
        if settings.asr_force_route:
            return (self.resolve_route(settings.asr_force_route),)
        return ()

    def ensure_route_loaded(self, route: str) -> str:
        resolved = self.resolve_route(route)
        self._providers[resolved].ensure_loaded()
        return resolved

    def unload_route(self, route: str, *, to_cpu: bool = False) -> str:
        resolved = self.resolve_route(route)
        self._providers[resolved].unload(to_cpu=to_cpu)
        return resolved

    def unload_all(self, *, to_cpu: bool = False) -> None:
        for provider in self._providers.values():
            provider.unload(to_cpu=to_cpu)

    def probe_source_language(
        self,
        file_path: Path | str,
        segments: list[VADSegment],
        *,
        audio_array: np.ndarray | None = None,
        max_segments: int | None = None,
        max_seconds: float | None = None,
    ) -> str | None:
        probe_route = self.resolve_route("whisper_turbo")
        provider = self._providers[probe_route]
        try:
            detected = provider.probe_language(
                file_path,
                segments,
                audio_array=audio_array,
                max_segments=max_segments,
                max_seconds=max_seconds,
            )
            self.last_probe_details = dict(getattr(provider, "last_probe_details", {}))
            return detected
        except Exception as exc:
            logger.warning(f"Source-language probe failed on {probe_route}: {exc}")
            self.last_probe_details = {}
            return None

    def process(
        self,
        file_path: Path | str,
        segments: list[VADSegment],
        profile: str = "standard",
        on_chunk: Callable[[list[Sentence], int], None] | None = None,
        chunk_size: int = 20,
        audio_array: np.ndarray | None = None,
        source_language: str | None = None,
        route_override: str | None = None,
    ) -> list[Sentence]:
        requested_route = self.resolve_route(
            route_override or self.route_for_language(source_language)
        )
        attempted_routes = self._router.fallback_chain(requested_route) or (
            requested_route,
        )
        last_error: Exception | None = None

        for candidate_route in attempted_routes:
            provider = self._providers.get(candidate_route)
            if provider is None:
                continue

            emitted_chunk_count = 0

            def _wrapped_on_chunk(batch: list[Sentence], total_so_far: int) -> None:
                nonlocal emitted_chunk_count
                emitted_chunk_count += 1
                if on_chunk is not None:
                    on_chunk(batch, total_so_far)

            try:
                sentences = provider.process(
                    file_path,
                    segments,
                    profile=profile,
                    on_chunk=_wrapped_on_chunk,
                    chunk_size=chunk_size,
                    audio_array=audio_array,
                    source_language=source_language,
                )
                self.last_timing = dict(getattr(provider, "last_timing", {}))
                self.last_route_usage = {
                    "requested_route": requested_route,
                    "actual_route": candidate_route,
                    "provider_id": provider.route.provider_id,
                    "model_id": provider.route.model_id,
                    "fallback_chain": attempted_routes,
                    "fallback_used": candidate_route != requested_route,
                    "during_asr_certified": provider.route.during_asr_certified,
                    "diagnostics": dict(getattr(provider, "last_diagnostics", {})),
                }
                return sentences
            except Exception as exc:
                last_error = exc
                provider.unload()
                if emitted_chunk_count > 0:
                    self.last_route_usage = {
                        "requested_route": requested_route,
                        "actual_route": candidate_route,
                        "provider_id": provider.route.provider_id,
                        "model_id": provider.route.model_id,
                        "fallback_chain": attempted_routes,
                        "fallback_used": candidate_route != requested_route,
                        "error": str(exc),
                        "diagnostics": dict(getattr(provider, "last_diagnostics", {})),
                    }
                    raise
                logger.warning(
                    f"ASR route {candidate_route} failed before streaming output: {exc}"
                )

        raise last_error or RuntimeError(
            f"No ASR provider could process route '{requested_route}'"
        )

    def route_health(self) -> dict[str, dict[str, Any]]:
        return {
            route_id: provider.healthcheck()
            for route_id, provider in self._providers.items()
        }
