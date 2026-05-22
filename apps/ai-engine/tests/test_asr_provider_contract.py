from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
from typing import Any

import numpy as np

from src.core.asr.base import ASRRouteConfig
from src.core.asr.providers.paraformer_provider import ParaformerZhASRProvider
from src.core.asr.providers.sensevoice_provider import SenseVoiceASRProvider
from src.core.asr.providers.whisper_provider import WhisperASRProvider
from src.core.smart_aligner import SmartAligner
from src.config import settings
from src.schemas import SegmentType, Sentence, VADSegment, Word


@dataclass
class _FakeProvider:
    route: ASRRouteConfig
    should_fail: bool = False
    last_timing: dict[str, float] = None

    def __post_init__(self) -> None:
        if self.last_timing is None:
            self.last_timing = {"total": 0.01}

    def ensure_loaded(self) -> None:
        return None

    def unload(self, *, to_cpu: bool = False) -> None:
        return None

    def probe_language(self, *args: Any, **kwargs: Any) -> str | None:
        return None

    def process(self, *args: Any, **kwargs: Any) -> list[Sentence]:
        if self.should_fail:
            raise RuntimeError(f"{self.route.route_id} failed")
        return [
            Sentence(
                text="你好",
                start=0.0,
                end=0.8,
                words=[
                    Word(word="你", start=0.0, end=0.4, confidence=0.95),
                    Word(word="好", start=0.4, end=0.8, confidence=0.95),
                ],
                detected_lang="zh",
            )
        ]

    def healthcheck(self) -> dict[str, Any]:
        return {"route_id": self.route.route_id}


def test_smart_aligner_exposes_route_aliases() -> None:
    previous_instance = SmartAligner._instance
    previous_initialized = SmartAligner._initialized
    try:
        SmartAligner._instance = None
        SmartAligner._initialized = False
        aligner = SmartAligner()

        assert aligner.resolve_route("turbo") == "whisper_turbo"
        assert aligner.resolve_route("full") == "whisper_full"
        assert aligner.route_decision_for_language(
            "en", requested_policy="during_asr"
        ).route_id == "distil_whisper_en"
    finally:
        SmartAligner._instance = previous_instance
        SmartAligner._initialized = previous_initialized


def test_smart_aligner_falls_back_before_any_chunk_is_emitted() -> None:
    previous_instance = SmartAligner._instance
    previous_initialized = SmartAligner._initialized
    try:
        SmartAligner._instance = None
        SmartAligner._initialized = False
        aligner = SmartAligner()
        aligner._providers["sensevoice_small"] = _FakeProvider(
            aligner.get_route_config("sensevoice_small"),
            should_fail=True,
        )
        aligner._providers["paraformer_zh"] = _FakeProvider(
            aligner.get_route_config("paraformer_zh"),
            should_fail=True,
        )
        aligner._providers["whisper_full"] = _FakeProvider(
            aligner.get_route_config("whisper_full"),
            should_fail=False,
        )

        segments = [
            VADSegment(
                start=0.0,
                end=1.0,
                type=SegmentType.HAPPY_CASE,
                duration=1.0,
            )
        ]
        sentences = aligner.process(
            Path("fake.wav"),
            segments,
            audio_array=np.zeros(16000, dtype=np.float32),
            source_language="zh",
            route_override="sensevoice_small",
        )

        assert len(sentences) == 1
        assert aligner.last_route_usage["actual_route"] == "whisper_full"
        assert aligner.last_route_usage["fallback_used"] is True
    finally:
        SmartAligner._instance = previous_instance
        SmartAligner._initialized = previous_initialized


def test_smart_aligner_reads_certified_routes_from_settings(monkeypatch) -> None:
    previous_instance = SmartAligner._instance
    previous_initialized = SmartAligner._initialized
    previous_routes = settings.AI_ASR_DURING_ASR_CERTIFIED_ROUTES
    try:
        monkeypatch.setattr(settings, "AI_ASR_DURING_ASR_CERTIFIED_ROUTES", "sensevoice_small")
        SmartAligner._instance = None
        SmartAligner._initialized = False
        aligner = SmartAligner()

        assert aligner.get_route_config("sensevoice_small").during_asr_certified is True
        assert aligner.get_route_config("whisper_turbo").during_asr_certified is False
    finally:
        settings.AI_ASR_DURING_ASR_CERTIFIED_ROUTES = previous_routes
        SmartAligner._instance = previous_instance
        SmartAligner._initialized = previous_initialized


def test_sensevoice_provider_sets_runtime_hub_and_cache(monkeypatch, tmp_path) -> None:
    calls: list[dict[str, Any]] = []

    class FakeAutoModel:
        def __init__(self, **kwargs: Any) -> None:
            calls.append(kwargs)

    monkeypatch.setattr("src.config.settings.AI_ASR_PROVIDER_CACHE_DIR", tmp_path)
    monkeypatch.delenv("MODELSCOPE_CACHE", raising=False)
    monkeypatch.delenv("HF_HOME", raising=False)
    monkeypatch.delenv("HF_HUB_CACHE", raising=False)
    monkeypatch.setattr("funasr.AutoModel", FakeAutoModel)
    monkeypatch.setattr(
        "funasr.utils.postprocess_utils.rich_transcription_postprocess",
        lambda text: text,
    )

    provider = SenseVoiceASRProvider(
        ASRRouteConfig(
            route_id="sensevoice_small",
            provider_id="sensevoice",
            model_id="iic/SenseVoiceSmall",
            display_name="SenseVoice",
            worker_modes=frozenset({"auto"}),
        )
    )

    provider.ensure_loaded()

    assert calls
    assert calls[0]["hub"] == "ms"
    assert calls[0]["disable_update"] is True
    assert calls[0]["trust_remote_code"] is True
    assert calls[0]["remote_code"] == "./model.py"
    assert Path(os.environ["MODELSCOPE_CACHE"]).resolve() == (tmp_path / "modelscope").resolve()
    assert Path(os.environ["HF_HOME"]).resolve() == (tmp_path / "huggingface").resolve()


def test_paraformer_provider_sets_runtime_hub_and_cache(monkeypatch, tmp_path) -> None:
    calls: list[dict[str, Any]] = []

    class FakeAutoModel:
        def __init__(self, **kwargs: Any) -> None:
            calls.append(kwargs)

    monkeypatch.setattr("src.config.settings.AI_ASR_PROVIDER_CACHE_DIR", tmp_path)
    monkeypatch.delenv("MODELSCOPE_CACHE", raising=False)
    monkeypatch.delenv("HF_HOME", raising=False)
    monkeypatch.delenv("HF_HUB_CACHE", raising=False)
    monkeypatch.setattr("funasr.AutoModel", FakeAutoModel)

    provider = ParaformerZhASRProvider(
        ASRRouteConfig(
            route_id="paraformer_zh",
            provider_id="paraformer",
            model_id="paraformer-zh",
            display_name="Paraformer",
            worker_modes=frozenset({"auto"}),
        )
    )

    provider.ensure_loaded()

    assert len(calls) >= 1
    assert calls[0]["hub"] == "ms"
    assert calls[0]["disable_update"] is True
    assert Path(os.environ["MODELSCOPE_CACHE"]).resolve() == (tmp_path / "modelscope").resolve()


def test_sensevoice_generate_retries_after_runtime_error() -> None:
    provider = SenseVoiceASRProvider(
        ASRRouteConfig(
            route_id="sensevoice_small",
            provider_id="sensevoice",
            model_id="iic/SenseVoiceSmall",
            display_name="SenseVoice",
            worker_modes=frozenset({"auto"}),
        )
    )

    class FakeModel:
        def __init__(self) -> None:
            self.calls: list[dict[str, Any]] = []

        def generate(self, **kwargs: Any) -> list[dict[str, Any]]:
            self.calls.append(kwargs)
            if len(self.calls) == 1:
                raise RuntimeError("cannot access local variable 'punc_res'")
            return [{"text": "你好", "timestamp": [[0, 200], [200, 400]]}]

    fake_model = FakeModel()
    provider._model = fake_model

    result = provider._generate(Path("sample.wav"), source_language="zh")

    assert result[0]["text"] == "你好"
    assert len(fake_model.calls) == 2


def test_sensevoice_process_streams_chunks_incrementally(monkeypatch) -> None:
    provider = SenseVoiceASRProvider(
        ASRRouteConfig(
            route_id="sensevoice_small",
            provider_id="sensevoice",
            model_id="iic/SenseVoiceSmall",
            display_name="SenseVoice",
            worker_modes=frozenset({"auto"}),
        )
    )
    monkeypatch.setattr(provider, "ensure_loaded", lambda: None)

    def _fake_transcribe(*args: Any, **kwargs: Any) -> list[Sentence]:
        segment = args[1]
        index = int(segment.start)
        return [
            Sentence(
                text=f"句子{index}",
                start=segment.start,
                end=segment.end,
                words=[
                    Word(
                        word=f"字{index}",
                        start=segment.start,
                        end=segment.end,
                        confidence=0.95,
                    )
                ],
                detected_lang="zh",
            )
        ]

    monkeypatch.setattr(provider, "_transcribe_segment_audio", _fake_transcribe)
    emitted: list[tuple[int, int, list[str]]] = []
    segments = [
        VADSegment(start=0.0, end=1.0, type=SegmentType.HAPPY_CASE, duration=1.0),
        VADSegment(start=1.0, end=2.0, type=SegmentType.HAPPY_CASE, duration=1.0),
        VADSegment(start=2.0, end=3.0, type=SegmentType.HAPPY_CASE, duration=1.0),
    ]

    sentences = provider.process(
        Path("fake.wav"),
        segments,
        profile="standard",
        on_chunk=lambda batch, total: emitted.append(
            (len(batch), total, [sentence.text for sentence in batch])
        ),
        chunk_size=2,
        audio_array=np.zeros(48000, dtype=np.float32),
        source_language="zh",
    )

    assert [sentence.text for sentence in sentences] == ["句子0", "句子1", "句子2"]
    assert emitted == [(2, 2, ["句子0", "句子1"]), (1, 3, ["句子2"])]
    assert all(sentence.phonetic for sentence in sentences)


def test_paraformer_process_streams_chunks_incrementally(monkeypatch) -> None:
    provider = ParaformerZhASRProvider(
        ASRRouteConfig(
            route_id="paraformer_zh",
            provider_id="paraformer",
            model_id="paraformer-zh",
            display_name="Paraformer",
            worker_modes=frozenset({"auto"}),
        )
    )
    monkeypatch.setattr(provider, "ensure_loaded", lambda: None)

    def _fake_transcribe(*args: Any, **kwargs: Any) -> list[Sentence]:
        segment = args[1]
        index = int(segment.start)
        return [
            Sentence(
                text=f"段落{index}",
                start=segment.start,
                end=segment.end,
                words=[
                    Word(
                        word=f"字{index}",
                        start=segment.start,
                        end=segment.end,
                        confidence=0.95,
                    )
                ],
                detected_lang="zh",
            )
        ]

    monkeypatch.setattr(provider, "_transcribe_segment_audio", _fake_transcribe)
    emitted: list[tuple[int, int, list[str]]] = []
    segments = [
        VADSegment(start=0.0, end=1.0, type=SegmentType.HAPPY_CASE, duration=1.0),
        VADSegment(start=1.0, end=2.0, type=SegmentType.HAPPY_CASE, duration=1.0),
        VADSegment(start=2.0, end=3.0, type=SegmentType.HAPPY_CASE, duration=1.0),
    ]

    sentences = provider.process(
        Path("fake.wav"),
        segments,
        profile="standard",
        on_chunk=lambda batch, total: emitted.append(
            (len(batch), total, [sentence.text for sentence in batch])
        ),
        chunk_size=2,
        audio_array=np.zeros(48000, dtype=np.float32),
        source_language="zh",
    )

    assert [sentence.text for sentence in sentences] == ["段落0", "段落1", "段落2"]
    assert emitted == [(2, 2, ["段落0", "段落1"]), (1, 3, ["段落2"])]
    assert all(sentence.phonetic for sentence in sentences)


def test_whisper_probe_samples_across_the_clip() -> None:
    provider = WhisperASRProvider(
        ASRRouteConfig(
            route_id="whisper_turbo",
            provider_id="whisper",
            model_id="large-v3-turbo",
            display_name="Turbo",
            worker_modes=frozenset({"auto"}),
            supports_probe=True,
        )
    )
    segments = [
        VADSegment(
            start=float(index),
            end=float(index) + 1.0,
            type=SegmentType.HAPPY_CASE,
            duration=1.0,
        )
        for index in range(6)
    ]

    selected = provider._select_probe_segments(segments, 4)

    assert [segment.start for segment in selected] == [0.0, 2.0, 3.0, 5.0]


def test_whisper_probe_prefers_distributed_majority_language(monkeypatch) -> None:
    provider = WhisperASRProvider(
        ASRRouteConfig(
            route_id="whisper_turbo",
            provider_id="whisper",
            model_id="large-v3-turbo",
            display_name="Turbo",
            worker_modes=frozenset({"auto"}),
            supports_probe=True,
        )
    )
    segments = [
        VADSegment(
            start=float(index),
            end=float(index) + 1.0,
            type=SegmentType.HAPPY_CASE,
            duration=1.0,
        )
        for index in range(6)
    ]

    def _fake_probe_segment_language(
        audio_full: np.ndarray,
        segment: VADSegment,
        *,
        max_seconds: float | None,
    ) -> tuple[str | None, float]:
        language = "en" if segment.start == 0.0 else "zh"
        return language, 1.0

    monkeypatch.setattr(provider, "_probe_segment_language", _fake_probe_segment_language)

    detected = provider._vote_probe_language(
        np.zeros(16000, dtype=np.float32),
        provider._select_probe_segments(segments, 4),
        max_seconds=12.0,
    )

    assert detected == "zh"


def test_whisper_probe_prefers_cjk_script_over_info_language() -> None:
    provider = WhisperASRProvider(
        ASRRouteConfig(
            route_id="whisper_turbo",
            provider_id="whisper",
            model_id="large-v3-turbo",
            display_name="Turbo",
            worker_modes=frozenset({"auto"}),
            supports_probe=True,
        )
    )

    fake_segment = type("Seg", (), {"text": "你好，今天怎么样？"})()
    fake_info = type("Info", (), {"language": "en"})()

    detected = provider._infer_probe_language(
        {"segments": [fake_segment], "info": fake_info}
    )

    assert detected == "zh"
