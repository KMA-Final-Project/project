from __future__ import annotations

import asyncio
import time
from pathlib import Path
from typing import Any

import src.async_pipeline as async_mod
from src.schemas import Sentence, Word
from tests.test_first_batch_streaming import (
    FakeAudioInspector,
    FakeAudioProcessor,
    FakeLLM,
    FakeMerger,
    FakeMinioClient,
    FakeVADManager,
    _make_sentence,
)


def _noop(*args: Any, **kwargs: Any) -> None:
    return None


class HybridRecordingAligner:
    def __init__(self, *, probe_result: str, events: list[str]) -> None:
        self.probe_result = probe_result
        self.events = events
        self.probe_calls: list[dict[str, Any]] = []
        self.process_calls: list[dict[str, Any]] = []
        self.unload_calls: list[tuple[str, str | None]] = []
        self.last_timing: dict[str, float] = {}

    def route_for_language(self, language: str | None) -> str:
        normalized = async_mod.settings.normalize_language_tag(language)
        if normalized == "yue" or normalized.split("-")[0] in {"zh", "ja", "ko"}:
            return "full"
        return "turbo"

    def resolve_route(self, route: str) -> str:
        return route

    def probe_source_language(
        self,
        file_path: Path,
        segments,
        *,
        audio_array=None,
        max_segments: int | None = None,
        max_seconds: float | None = None,
    ) -> str:
        self.probe_calls.append(
            {
                "file_path": str(file_path),
                "segment_count": len(segments),
                "max_segments": max_segments,
                "max_seconds": max_seconds,
            }
        )
        self.events.append("probe")
        return self.probe_result

    def process(
        self,
        file_path: Path,
        segments,
        profile: str = "standard",
        on_chunk=None,
        chunk_size: int = 8,
        audio_array=None,
        source_language: str | None = None,
        route_override: str | None = None,
    ) -> list[Sentence]:
        self.process_calls.append(
            {
                "source_language": source_language,
                "route_override": route_override,
                "segment_count": len(segments),
            }
        )
        self.events.append("process_start")

        if route_override == "full":
            batch_1 = [
                Sentence(
                    text="你好",
                    start=0.0,
                    end=0.8,
                    words=[
                        Word(word="你", start=0.0, end=0.4, confidence=0.98),
                        Word(word="好", start=0.4, end=0.8, confidence=0.98),
                    ],
                    detected_lang="zh",
                )
            ]
            batch_2 = [
                Sentence(
                    text="世界",
                    start=0.8,
                    end=1.6,
                    words=[
                        Word(word="世", start=0.8, end=1.2, confidence=0.98),
                        Word(word="界", start=1.2, end=1.6, confidence=0.98),
                    ],
                    detected_lang="zh",
                )
            ]
        else:
            batch_1 = [_make_sentence(0, "Hello")]
            batch_2 = [_make_sentence(1, "world")]

        if on_chunk:
            on_chunk(batch_1, len(batch_1))
            on_chunk(batch_2, len(batch_1) + len(batch_2))

        self.events.append("process_return")
        return batch_1 + batch_2

    def unload_route(self, route: str, *, to_cpu: bool = False) -> str:
        self.unload_calls.append(("unload_route", route))
        return route

    def unload_all(self, *, to_cpu: bool = False) -> None:
        self.unload_calls.append(("unload_all", None))


class RecordingNMT:
    def __init__(self, events: list[str]) -> None:
        self.events = events
        self.calls: list[dict[str, Any]] = []

    def translate_batch(
        self,
        texts: list[str],
        source_lang: str,
        target_lang: str,
    ) -> list[str]:
        self.calls.append(
            {
                "texts": list(texts),
                "source_lang": source_lang,
                "target_lang": target_lang,
            }
        )
        self.events.append("translate_batch")
        return [f"{target_lang}:{text}" for text in texts]


class RecordingNMTTranslatorHolder:
    translator: RecordingNMT | None = None

    @staticmethod
    def get_instance() -> RecordingNMT:
        if RecordingNMTTranslatorHolder.translator is None:
            raise AssertionError("translator not configured")
        return RecordingNMTTranslatorHolder.translator

    @staticmethod
    def unload_instance(*, to_cpu: bool = False) -> None:
        return None


class HybridFakePipeline:
    def __init__(self, aligner: HybridRecordingAligner) -> None:
        self.audio_processor = FakeAudioProcessor()
        self.audio_inspector = FakeAudioInspector()
        self.vad_manager = FakeVADManager()
        self.aligner = aligner
        self.merger = FakeMerger()
        self.llm = FakeLLM()
        self.last_run_metrics: dict[str, Any] = {}


def _configure_hybrid_runtime(monkeypatch, events: list[str]) -> None:
    monkeypatch.setattr(async_mod, "update_media_status", _noop)
    monkeypatch.setattr(async_mod, "publish_progress", _noop)
    monkeypatch.setattr(async_mod, "publish_chunk_ready", _noop)
    monkeypatch.setattr(async_mod, "publish_batch_ready", _noop)
    monkeypatch.setattr(async_mod, "NMTTranslator", RecordingNMTTranslatorHolder)
    monkeypatch.setattr(async_mod.settings, "AI_TRANSLATION_START_POLICY", "after_asr")
    monkeypatch.setattr(async_mod.settings, "AI_ENABLE_NMT_PREFETCH", False)
    monkeypatch.setattr(async_mod.settings, "AI_SOURCE_LANGUAGE_HINT", "")
    monkeypatch.setattr(async_mod.settings, "AI_SOURCE_LANGUAGE_PROBE_ENABLED", True)
    monkeypatch.setattr(async_mod.settings, "AI_SOURCE_LANGUAGE_PROBE_MAX_SEGMENTS", 2)
    monkeypatch.setattr(async_mod.settings, "AI_SOURCE_LANGUAGE_PROBE_MAX_SECONDS", 8.0)
    RecordingNMTTranslatorHolder.translator = RecordingNMT(events)


def _run_pipeline(monkeypatch, *, probe_result: str) -> tuple[Any, list[dict[str, Any]], HybridRecordingAligner, RecordingNMT, list[str]]:
    events: list[str] = []
    _configure_hybrid_runtime(monkeypatch, events)

    audio_path = Path("test-input.wav")
    trace: list[dict[str, Any]] = []
    aligner = HybridRecordingAligner(probe_result=probe_result, events=events)
    pipeline = HybridFakePipeline(aligner)

    output = asyncio.run(
        async_mod.run_v2_pipeline_async(
            pipeline,
            FakeMinioClient(),
            audio_path,
            "media-123",
            user_id="user-123",
            started_at=time.time(),
            target_lang="vi",
            debug_trace=trace,
        )
    )

    translator = RecordingNMTTranslatorHolder.translator
    assert translator is not None
    return output, trace, aligner, translator, events


def test_hybrid_routing_selects_turbo_for_english_probe(monkeypatch) -> None:
    output, trace, aligner, translator, _events = _run_pipeline(
        monkeypatch,
        probe_result="en",
    )

    assert aligner.process_calls[0]["route_override"] == "turbo"
    assert aligner.process_calls[0]["source_language"] == "en"
    assert translator.calls[0]["source_lang"] == "en"
    assert output.metadata.model_used == async_mod.settings.WHISPER_MODEL_TURBO
    assert output.metadata.source_lang == "en"
    assert any(
        entry["event"] == "source_routing_decided" and entry["route"] == "turbo"
        for entry in trace
    )


def test_hybrid_routing_selects_full_for_chinese_probe(monkeypatch) -> None:
    output, trace, aligner, translator, _events = _run_pipeline(
        monkeypatch,
        probe_result="zh",
    )

    assert aligner.process_calls[0]["route_override"] == "full"
    assert aligner.process_calls[0]["source_language"] == "zh"
    assert ("unload_route", "turbo") in aligner.unload_calls
    assert ("unload_all", None) in aligner.unload_calls
    assert translator.calls[0]["source_lang"] == "zh"
    assert output.metadata.model_used == async_mod.settings.WHISPER_MODEL_FULL
    assert output.metadata.source_lang == "zh"
    assert any(
        entry["event"] == "source_routing_decided" and entry["route"] == "full"
        for entry in trace
    )


def test_hybrid_default_delays_translation_until_after_asr(monkeypatch) -> None:
    _output, trace, _aligner, _translator, events = _run_pipeline(
        monkeypatch,
        probe_result="en",
    )

    assert events.index("process_return") < events.index("translate_batch")

    asr_completed_index = next(
        index for index, entry in enumerate(trace) if entry["event"] == "asr_completed"
    )
    batch_uploaded_index = next(
        index for index, entry in enumerate(trace) if entry["event"] == "batch_uploaded"
    )
    assert asr_completed_index < batch_uploaded_index
