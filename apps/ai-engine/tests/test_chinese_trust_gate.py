from __future__ import annotations

import asyncio
import time
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import numpy as np

import src.async_pipeline as async_mod
from src.core.chinese_phonetics import apply_chinese_pinyin
from src.core.chinese_prior import ChineseRoutePrior, build_chinese_route_prior
from src.core.transcript_trust_gate import ChineseTranscriptTrustGate
from src.core.chinese_window_profiler import profile_chinese_transcript_windows
from src.schemas import SegmentType, Sentence, VADSegment, Word
from tests.test_first_batch_streaming import (
    FakeAudioInspector,
    FakeAudioProcessor,
    FakeLLM,
    FakeMerger,
    FakeVADManager,
)


def _noop(*args: Any, **kwargs: Any) -> None:
    return None


def _english_sentence(text: str = "hello hello hello") -> Sentence:
    return Sentence(
        text=text,
        start=0.0,
        end=1.0,
        words=[Word(word="hello", start=0.0, end=1.0, confidence=0.1)],
        detected_lang="en",
    )


def _chinese_sentence(text: str = "你好世界") -> Sentence:
    return Sentence(
        text=text,
        start=0.0,
        end=1.0,
        words=[
            Word(word="你", start=0.0, end=0.25, confidence=0.98),
            Word(word="好", start=0.25, end=0.5, confidence=0.98),
            Word(word="世", start=0.5, end=0.75, confidence=0.98),
            Word(word="界", start=0.75, end=1.0, confidence=0.98),
        ],
        detected_lang="zh",
    )


def test_build_chinese_route_prior_uses_metadata_as_soft_prior() -> None:
    prior = build_chinese_route_prior(
        media_context={
            "title": "Mandarin Chinese lesson for beginners",
            "audioS3Key": "uploads/dialogue_sample.mp3",
        },
        local_audio_path=Path("demo.wav"),
        probe_source_lang="en",
        probe_details={"scores": {"en": 7.0, "zh": 4.6}},
    )

    assert prior.suspected_family == "zh"
    assert prior.should_gate is True
    assert prior.should_bias_route is False
    assert "title_keywords" in prior.sources
    assert "filename_keywords" in prior.sources


def test_chinese_trust_gate_marks_bad_english_candidate_as_suspicious() -> None:
    gate = ChineseTranscriptTrustGate()
    prior = ChineseRoutePrior(
        prior_score=2.5,
        suspected_family="zh",
        confidence_band="medium",
        sources=("title_keywords", "filename_keywords"),
        title="Mandarin Chinese lesson",
        filename="dialogue_sample.mp3",
        probe_source_lang="zh",
        probe_scores=(("zh", 5.2), ("en", 4.1)),
        probe_near_tie=True,
    )

    decision = gate.evaluate(
        prior=prior,
        sentences=[_english_sentence("hello hello hello hello")],
        route_id="distil_whisper_en",
        diagnostics={"avg_logprob": -1.2},
        probe_details={"scores": {"zh": 5.2, "en": 4.1}},
        stage="first_pass",
        duration_seconds=20.0,
        windows=profile_chinese_transcript_windows([_english_sentence("hello hello hello hello")]),
    )

    assert decision.verdict == "suspicious_recover"
    assert decision.publication_blocked is True
    assert "route_mismatch" in decision.reasons
    assert "low_han_ratio" in decision.reasons
    assert decision.suspicious_score >= async_mod.settings.AI_CHINESE_TRUST_SUSPICIOUS_SCORE


def test_apply_chinese_pinyin_populates_sentence_and_word_phonetics() -> None:
    sentence = _chinese_sentence("你好")

    apply_chinese_pinyin([sentence])

    assert sentence.words[0].phoneme
    assert sentence.words[1].phoneme
    assert sentence.phonetic
    assert "n" in sentence.phonetic.lower()


class _TrustGateRecordingMinio:
    def __init__(self) -> None:
        self.chunk_uploads: list[list[dict[str, Any]]] = []
        self.batch_uploads: list[dict[str, Any]] = []

    def upload_chunk(
        self,
        media_id: str,
        chunk_index: int,
        data: list[dict[str, Any]],
    ) -> tuple[str, str]:
        self.chunk_uploads.append(data)
        return (
            f"{media_id}/chunks/{chunk_index}.json",
            f"http://fake/chunks/{chunk_index}.json",
        )

    def upload_translated_batch(self, media_id: str, batch) -> tuple[str, str]:
        payload = batch.model_dump()
        self.batch_uploads.append(payload)
        return (
            f"{media_id}/translated_batches/{batch.batch_index}.json",
            f"http://fake/batches/{batch.batch_index}.json",
        )


class _TrustGateNMT:
    def __init__(self) -> None:
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
        return [f"{target_lang}:{text}" for text in texts]


class _TrustGateNMTHolder:
    translator: _TrustGateNMT | None = None

    @staticmethod
    def get_instance() -> _TrustGateNMT:
        if _TrustGateNMTHolder.translator is None:
            raise AssertionError("translator not configured")
        return _TrustGateNMTHolder.translator

    @staticmethod
    def unload_instance(*, to_cpu: bool = False) -> None:
        return None


class _TrustGateAligner:
    def __init__(self) -> None:
        self.last_timing: dict[str, float] = {}
        self.last_route_usage: dict[str, Any] = {}
        self.last_probe_details: dict[str, Any] = {}
        self.process_calls: list[dict[str, Any]] = []
        self.unload_calls: list[tuple[str, str | None]] = []

    def route_decision_for_language(
        self,
        language: str | None,
        *,
        requested_policy: str,
        route_override: str | None = None,
    ) -> SimpleNamespace:
        normalized = async_mod.settings.normalize_language_tag(route_override or language)
        route_id = route_override or "distil_whisper_en"
        provider_id = "whisper"
        model_id = "distil-large-v3.5"
        if normalized in {"zh", "yue"}:
            route_id = route_override or async_mod.settings.asr_default_route_zh
            provider_id = _provider_id_for_route(route_id)
            model_id = _model_id_for_route(route_id)
        if route_override == "whisper_full":
            route_id = "whisper_full"
            provider_id = "whisper"
            model_id = "large-v3"
        return SimpleNamespace(
            route_id=route_id,
            provider_id=provider_id,
            model_id=model_id,
            effective_policy=requested_policy,
            auto_downgraded=False,
            fallback_chain=(route_id,),
        )

    def route_for_language(self, language: str | None) -> str:
        normalized = async_mod.settings.normalize_language_tag(language)
        return (
            async_mod.settings.asr_default_route_zh
            if normalized in {"zh", "yue"}
            else "distil_whisper_en"
        )

    def resolve_route(self, route: str) -> str:
        return route

    def probe_source_language(
        self,
        file_path: Path,
        segments: list[VADSegment],
        *,
        audio_array=None,
        max_segments: int | None = None,
        max_seconds: float | None = None,
    ) -> str:
        del file_path, segments, audio_array, max_segments, max_seconds
        self.last_probe_details = {"winner": "en", "scores": {"en": 7.0, "zh": 4.6}}
        return "en"

    def unload_route(self, route: str, *, to_cpu: bool = False) -> str:
        del to_cpu
        self.unload_calls.append(("unload_route", route))
        return route

    def unload_all(self, *, to_cpu: bool = False) -> None:
        del to_cpu
        self.unload_calls.append(("unload_all", None))

    def process(
        self,
        file_path: Path,
        segments: list[VADSegment],
        profile: str = "standard",
        on_chunk=None,
        chunk_size: int = 8,
        audio_array=None,
        source_language: str | None = None,
        route_override: str | None = None,
    ) -> list[Sentence]:
        del file_path, segments, profile, chunk_size, audio_array, source_language
        route = route_override or "distil_whisper_en"
        self.process_calls.append({"route_override": route})

        if route == "distil_whisper_en":
            batch = [_english_sentence()]
            if on_chunk:
                on_chunk(batch, len(batch))
            self.last_route_usage = {
                "requested_route": route,
                "actual_route": route,
                "provider_id": "whisper",
                "model_id": "distil-large-v3.5",
                "fallback_chain": (route,),
                "fallback_used": False,
                "during_asr_certified": True,
                "diagnostics": {"avg_logprob": -1.2, "detected_lang": "en"},
            }
            return batch

        batch = [_chinese_sentence()]
        if on_chunk:
            on_chunk(batch, len(batch))
        self.last_route_usage = {
            "requested_route": route,
            "actual_route": route,
            "provider_id": _provider_id_for_route(route),
            "model_id": _model_id_for_route(route),
            "fallback_chain": (route,),
            "fallback_used": False,
            "during_asr_certified": route == "sensevoice_small",
            "diagnostics": {
                "avg_word_confidence": 0.98,
                "detected_lang": "zh",
            },
        }
        return batch


class _TrustGatePipeline:
    def __init__(self) -> None:
        self.audio_processor = FakeAudioProcessor()
        self.audio_inspector = FakeAudioInspector()
        self.vad_manager = FakeVADManager()
        self.aligner = _TrustGateAligner()
        self.merger = FakeMerger()
        self.llm = FakeLLM()
        self.last_run_metrics: dict[str, Any] = {}


def _provider_id_for_route(route: str) -> str:
    if route == "sensevoice_small":
        return "sensevoice"
    if route == "paraformer_zh":
        return "paraformer"
    return "whisper"


def _model_id_for_route(route: str) -> str:
    if route == "sensevoice_small":
        return "SenseVoiceSmall"
    if route == "paraformer_zh":
        return "paraformer-zh"
    if route == "whisper_full":
        return "large-v3"
    return "distil-large-v3.5"


def test_pipeline_holds_untrusted_chinese_chunks_until_recovery_succeeds(
    monkeypatch,
    tmp_path,
) -> None:
    chunk_events: list[int] = []
    batch_events: list[int] = []

    monkeypatch.setattr(async_mod, "update_media_status", _noop)
    monkeypatch.setattr(async_mod, "publish_progress", _noop)
    monkeypatch.setattr(
        async_mod,
        "publish_chunk_ready",
        lambda **kwargs: chunk_events.append(int(kwargs["chunk_index"])),
    )
    monkeypatch.setattr(
        async_mod,
        "publish_batch_ready",
        lambda **kwargs: batch_events.append(int(kwargs["batch_index"])),
    )
    monkeypatch.setattr(async_mod, "NMTTranslator", _TrustGateNMTHolder)
    monkeypatch.setattr(async_mod.settings, "AI_ENABLE_LLM_REFINEMENT", False)
    monkeypatch.setattr(async_mod.settings, "AI_TRANSLATION_START_POLICY", "during_asr")
    monkeypatch.setattr(async_mod.settings, "AI_ENABLE_NMT_PREFETCH", True)
    _TrustGateNMTHolder.translator = _TrustGateNMT()

    audio_path = tmp_path / "input.wav"
    audio_path.write_bytes(b"fake-audio")
    pipeline = _TrustGatePipeline()
    minio = _TrustGateRecordingMinio()
    trace: list[dict[str, Any]] = []

    output = asyncio.run(
        async_mod.run_v2_pipeline_async(
            pipeline,
            minio,
            audio_path,
            "media-zh-123",
            user_id="user-123",
            started_at=time.time(),
            target_lang="vi",
            debug_trace=trace,
            media_context={
                "title": "Mandarin Chinese lesson for beginners",
                "audioS3Key": "uploads/dialogue_sample.mp3",
            },
        )
    )

    trust_events = [
        index for index, entry in enumerate(trace) if entry["event"] == "trust_gate_evaluated"
    ]
    first_chunk_index = next(
        index for index, entry in enumerate(trace) if entry["event"] == "chunk_uploaded"
    )

    assert trust_events
    assert first_chunk_index > trust_events[-1]
    assert [call["route_override"] for call in pipeline.aligner.process_calls] == [
        "distil_whisper_en",
        "sensevoice_small",
    ]
    assert len(minio.chunk_uploads) == 1
    assert minio.chunk_uploads[0][0]["text"] == "你好世界"
    assert chunk_events == [0]
    assert batch_events == [0]
    assert output.metadata.source_lang == "zh"
    assert output.metadata.model_used == "SenseVoiceSmall"
    assert output.segments[0].translation == "vi:你好世界"
    assert output.segments[0].phonetic
    assert pipeline.last_run_metrics["translation_start_policy"] == "after_asr"
    assert pipeline.last_run_metrics["trust_gate_active"] is True
    assert len(pipeline.last_run_metrics["trust_attempts"]) >= 2
    assert (
        pipeline.last_run_metrics["trust_attempts"][0]["decision"]["verdict"]
        == "suspicious_recover"
    )
    assert pipeline.last_run_metrics["trust_decision"]["ownership_trusted"] is True


def test_pipeline_can_start_from_paraformer_default_route(monkeypatch, tmp_path) -> None:
    chunk_events: list[int] = []

    monkeypatch.setattr(async_mod, "update_media_status", _noop)
    monkeypatch.setattr(async_mod, "publish_progress", _noop)
    monkeypatch.setattr(
        async_mod,
        "publish_chunk_ready",
        lambda **kwargs: chunk_events.append(int(kwargs["chunk_index"])),
    )
    monkeypatch.setattr(async_mod, "publish_batch_ready", _noop)
    monkeypatch.setattr(async_mod, "NMTTranslator", _TrustGateNMTHolder)
    monkeypatch.setattr(async_mod.settings, "AI_ENABLE_LLM_REFINEMENT", False)
    monkeypatch.setattr(async_mod.settings, "AI_TRANSLATION_START_POLICY", "during_asr")
    monkeypatch.setattr(async_mod.settings, "AI_ENABLE_NMT_PREFETCH", True)
    monkeypatch.setattr(async_mod.settings, "AI_ASR_DEFAULT_ROUTE_ZH", "paraformer_zh")
    monkeypatch.setattr(async_mod.settings, "AI_CHINESE_RECOVERY_ROUTE_IDS", "")
    _TrustGateNMTHolder.translator = _TrustGateNMT()

    audio_path = tmp_path / "input.wav"
    audio_path.write_bytes(b"fake-audio")
    pipeline = _TrustGatePipeline()
    minio = _TrustGateRecordingMinio()

    output = asyncio.run(
        async_mod.run_v2_pipeline_async(
            pipeline,
            minio,
            audio_path,
            "media-zh-paraformer",
            user_id="user-123",
            started_at=time.time(),
            target_lang="vi",
            media_context={
                "title": "Mandarin Chinese lesson for beginners",
                "audioS3Key": "uploads/dialogue_sample.mp3",
            },
        )
    )

    assert [call["route_override"] for call in pipeline.aligner.process_calls] == [
        "distil_whisper_en",
        "paraformer_zh",
    ]
    assert pipeline.last_run_metrics["route"] == "paraformer_zh"
    assert pipeline.last_run_metrics["translation_start_policy"] == "after_asr"
    assert pipeline.last_run_metrics["trust_gate_active"] is True
    assert chunk_events == [0]
    assert output.metadata.source_lang == "zh"
    assert output.metadata.model_used == "paraformer-zh"
