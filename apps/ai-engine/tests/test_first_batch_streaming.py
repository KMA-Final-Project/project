"""Fake-only first-batch streaming tests.

These tests intentionally keep Redis/Postgres/MinIO fake and focus on ordering
and upload sequencing. Live infrastructure contract validation now lives in
`src.scripts.test_v2_pipeline --live-infra` so this file stays fast and
fully deterministic.
"""

from __future__ import annotations

import asyncio
import time
from pathlib import Path
from types import SimpleNamespace

import numpy as np

import src.async_pipeline as async_mod
import src.main as main_mod
from src.schemas import (
    ContextAnalysisResult,
    SegmentType,
    Sentence,
    TranslationStyle,
    VADSegment,
    VietnamesePronoun,
    Word,
)


def _make_sentence(index: int, text: str) -> Sentence:
    return Sentence(
        text=text,
        start=float(index),
        end=float(index) + 0.8,
        words=[
            Word(
                word=text,
                start=float(index),
                end=float(index) + 0.8,
                confidence=0.95,
            )
        ],
        detected_lang="en",
    )


class FakeAudioProcessor:
    def process(self, audio_path: Path):
        return SimpleNamespace(path=audio_path)


class FakeAudioInspector:
    def inspect(self, standardized_path: Path) -> str:
        return "standard"


class FakeVADManager:
    def process(self, standardized_path: Path, profile: str = "standard"):
        segments = [
            VADSegment(start=0.0, end=1.0, type=SegmentType.HAPPY_CASE, duration=1.0),
            VADSegment(start=1.0, end=2.0, type=SegmentType.HAPPY_CASE, duration=1.0),
        ]
        return segments, standardized_path, np.zeros(32000, dtype=np.float32)


class FakeAligner:
    def process(
        self,
        file_path: Path,
        segments: list[VADSegment],
        profile: str = "standard",
        on_chunk=None,
        chunk_size: int = 8,
        audio_array=None,
    ) -> list[Sentence]:
        batch_1 = [_make_sentence(0, "Hello")]
        batch_2 = [_make_sentence(1, "world")]
        if on_chunk:
            on_chunk(batch_1, 1)
            on_chunk(batch_2, 2)
        return batch_1 + batch_2


class FakeMerger:
    def needs_merge(self, sentences: list[Sentence], source_lang: str = "en") -> bool:
        return False

    def process_stream_window(
        self,
        sentences: list[Sentence],
        *,
        source_lang: str = "en",
        context_style: str = "Speech/Dialogue",
        core_size: int | None = None,
    ) -> tuple[list[Sentence], int]:
        if core_size is None:
            core_size = len(sentences)
        return list(sentences[:core_size]), core_size

    def process(
        self,
        sentences: list[Sentence],
        source_lang: str = "en",
        context_style: str = "Speech/Dialogue",
    ):
        return [sentences]

    def correct_homophones(
        self, sentences: list[Sentence], context_style: str = "Speech/Dialogue"
    ) -> list[Sentence]:
        return list(sentences)


class TrackingMerger(FakeMerger):
    def __init__(self, *, needs_merge_result: bool) -> None:
        self.needs_merge_result = needs_merge_result
        self.process_calls = 0
        self.correct_homophones_calls = 0

    def needs_merge(self, sentences: list[Sentence], source_lang: str = "en") -> bool:
        return self.needs_merge_result

    def process(
        self,
        sentences: list[Sentence],
        source_lang: str = "en",
        context_style: str = "Speech/Dialogue",
    ):
        self.process_calls += 1
        return [sentences]

    def correct_homophones(
        self, sentences: list[Sentence], context_style: str = "Speech/Dialogue"
    ) -> list[Sentence]:
        self.correct_homophones_calls += 1
        return list(sentences)


class FakeLLM:
    def analyze_context(
        self, text_samples: list[str], target_lang: str
    ) -> ContextAnalysisResult:
        return ContextAnalysisResult(
            detected_style=TranslationStyle.NEUTRAL,
            detected_pronouns=VietnamesePronoun.TOI_BAN,
            summary="Test context",
            keywords=[],
        )

    def refine_batch(
        self,
        sources: list[str],
        nmt_translations: list[str],
        context: ContextAnalysisResult,
        target_lang: str,
    ) -> list[str]:
        return list(nmt_translations)


class FakeNMT:
    def translate_batch(
        self,
        texts: list[str],
        source_lang: str,
        target_lang: str,
    ) -> list[str]:
        return [f"{target_lang}:{text}" for text in texts]


class FakeNMTTranslatorHolder:
    @staticmethod
    def get_instance() -> FakeNMT:
        return FakeNMT()


class FakePipeline:
    def __init__(self):
        self.audio_processor = FakeAudioProcessor()
        self.audio_inspector = FakeAudioInspector()
        self.vad_manager = FakeVADManager()
        self.aligner = FakeAligner()
        self.merger = FakeMerger()
        self.llm = FakeLLM()


class RecordingLLM(FakeLLM):
    def __init__(self) -> None:
        self.analyze_calls = 0
        self.refine_calls = 0

    def analyze_context(
        self, text_samples: list[str], target_lang: str
    ) -> ContextAnalysisResult:
        self.analyze_calls += 1
        return super().analyze_context(text_samples, target_lang)

    def refine_batch(
        self,
        sources: list[str],
        nmt_translations: list[str],
        context: ContextAnalysisResult,
        target_lang: str,
    ) -> list[str]:
        self.refine_calls += 1
        return super().refine_batch(sources, nmt_translations, context, target_lang)


class FakePipelineWithRecordingLLM(FakePipeline):
    def __init__(self) -> None:
        super().__init__()
        self.llm = RecordingLLM()


class CjkFakeAligner:
    def process(
        self,
        file_path: Path,
        segments: list[VADSegment],
        profile: str = "standard",
        on_chunk=None,
        chunk_size: int = 8,
        audio_array=None,
    ) -> list[Sentence]:
        batch_1 = [
            Sentence(
                text="你好世界",
                start=0.0,
                end=0.8,
                words=[
                    Word(word="你", start=0.0, end=0.2, confidence=0.98),
                    Word(word="好", start=0.2, end=0.4, confidence=0.98),
                    Word(word="世", start=0.4, end=0.6, confidence=0.98),
                    Word(word="界", start=0.6, end=0.8, confidence=0.98),
                ],
                detected_lang="zh",
            )
        ]
        if on_chunk:
            on_chunk(batch_1, 1)
        return batch_1


class CjkFakePipeline(FakePipeline):
    def __init__(self, merger: TrackingMerger) -> None:
        super().__init__()
        self.aligner = CjkFakeAligner()
        self.merger = merger


class FakeMinioClient:
    instances: list["FakeMinioClient"] = []

    def __init__(self) -> None:
        self.uploads: list[dict] = []
        FakeMinioClient.instances.append(self)

    def download_audio(self, object_key: str, local_path: Path):
        local_path.parent.mkdir(parents=True, exist_ok=True)
        local_path.write_bytes(b"fake-audio")
        return local_path

    def upload_chunk(self, media_id: str, chunk_index: int, data: list[dict]):
        self.uploads.append({"type": "chunk", "index": chunk_index, "count": len(data)})
        return (
            f"{media_id}/chunks/{chunk_index}.json",
            f"http://fake/chunks/{chunk_index}.json",
        )

    def upload_translated_batch(self, media_id: str, batch):
        self.uploads.append(
            {"type": "batch", "index": batch.batch_index, "count": len(batch.segments)}
        )
        return (
            f"{media_id}/translated_batches/{batch.batch_index}.json",
            f"http://fake/batches/{batch.batch_index}.json",
        )

    def upload_final_result(self, media_id: str, output):
        self.uploads.append({"type": "final", "count": len(output.segments)})
        return f"{media_id}/final.json", "http://fake/final.json"


def test_first_batch_trace_precedes_pipeline_completion(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(async_mod, "update_media_status", lambda *args, **kwargs: None)
    monkeypatch.setattr(async_mod, "publish_progress", lambda *args, **kwargs: None)
    monkeypatch.setattr(async_mod, "publish_chunk_ready", lambda *args, **kwargs: None)
    monkeypatch.setattr(async_mod, "publish_batch_ready", lambda *args, **kwargs: None)
    monkeypatch.setattr(async_mod, "NMTTranslator", FakeNMTTranslatorHolder)

    audio_path = tmp_path / "input.wav"
    audio_path.write_bytes(b"fake-audio")

    pipeline = FakePipeline()
    minio = FakeMinioClient()
    trace: list[dict] = []

    output = asyncio.run(
        async_mod.run_v2_pipeline_async(
            pipeline,
            minio,
            audio_path,
            "media-123",
            user_id="user-123",
            started_at=time.time(),
            target_lang="vi",
            debug_trace=trace,
        )
    )
    minio.upload_final_result("media-123", output)

    events = [entry["event"] for entry in trace]
    for expected in [
        "audio_prep_done",
        "inspect_done",
        "vad_done",
        "chunk_uploaded",
        "batch_uploaded",
        "pipeline_completed",
    ]:
        assert expected in events

    first_batch = next(entry for entry in trace if entry["event"] == "batch_uploaded")
    completed = next(entry for entry in trace if entry["event"] == "pipeline_completed")
    first_batch_idx = next(
        i for i, entry in enumerate(trace) if entry["event"] == "batch_uploaded"
    )
    completed_idx = next(
        i for i, entry in enumerate(trace) if entry["event"] == "pipeline_completed"
    )

    assert first_batch_idx < completed_idx
    assert first_batch["t"] <= completed["t"]
    assert output.segments[0].translation == "vi:Hello"

    upload_types = [entry["type"] for entry in minio.uploads]
    assert upload_types.index("batch") < upload_types.index("final")


def test_pipeline_skips_llm_context_and_refinement_when_disabled(
    monkeypatch, tmp_path
) -> None:
    monkeypatch.setattr(async_mod, "update_media_status", lambda *args, **kwargs: None)
    monkeypatch.setattr(async_mod, "publish_progress", lambda *args, **kwargs: None)
    monkeypatch.setattr(async_mod, "publish_chunk_ready", lambda *args, **kwargs: None)
    monkeypatch.setattr(async_mod, "publish_batch_ready", lambda *args, **kwargs: None)
    monkeypatch.setattr(async_mod, "NMTTranslator", FakeNMTTranslatorHolder)
    monkeypatch.setattr(async_mod.settings, "AI_ENABLE_LLM_REFINEMENT", False)

    audio_path = tmp_path / "input.wav"
    audio_path.write_bytes(b"fake-audio")

    pipeline = FakePipelineWithRecordingLLM()

    asyncio.run(
        async_mod.run_v2_pipeline_async(
            pipeline,
            FakeMinioClient(),
            audio_path,
            "media-123",
            user_id="user-123",
            started_at=time.time(),
            target_lang="vi",
        )
    )

    assert pipeline.llm.analyze_calls == 0
    assert pipeline.llm.refine_calls == 0


def test_pipeline_runs_llm_context_and_refinement_when_enabled(
    monkeypatch, tmp_path
) -> None:
    monkeypatch.setattr(async_mod, "update_media_status", lambda *args, **kwargs: None)
    monkeypatch.setattr(async_mod, "publish_progress", lambda *args, **kwargs: None)
    monkeypatch.setattr(async_mod, "publish_chunk_ready", lambda *args, **kwargs: None)
    monkeypatch.setattr(async_mod, "publish_batch_ready", lambda *args, **kwargs: None)
    monkeypatch.setattr(async_mod, "NMTTranslator", FakeNMTTranslatorHolder)
    monkeypatch.setattr(async_mod.settings, "AI_ENABLE_LLM_REFINEMENT", True)

    audio_path = tmp_path / "input.wav"
    audio_path.write_bytes(b"fake-audio")

    pipeline = FakePipelineWithRecordingLLM()

    asyncio.run(
        async_mod.run_v2_pipeline_async(
            pipeline,
            FakeMinioClient(),
            audio_path,
            "media-123",
            user_id="user-123",
            started_at=time.time(),
            target_lang="vi",
        )
    )

    assert pipeline.llm.analyze_calls == 1
    assert pipeline.llm.refine_calls == 1


def test_cjk_buffer_skips_standalone_homophone_correction_when_merge_not_needed(
    monkeypatch, tmp_path
) -> None:
    monkeypatch.setattr(async_mod, "update_media_status", lambda *args, **kwargs: None)
    monkeypatch.setattr(async_mod, "publish_progress", lambda *args, **kwargs: None)
    monkeypatch.setattr(async_mod, "publish_chunk_ready", lambda *args, **kwargs: None)
    monkeypatch.setattr(async_mod, "publish_batch_ready", lambda *args, **kwargs: None)
    monkeypatch.setattr(async_mod, "NMTTranslator", FakeNMTTranslatorHolder)
    monkeypatch.setattr(async_mod.settings, "AI_ENABLE_LLM_REFINEMENT", False)

    audio_path = tmp_path / "input.wav"
    audio_path.write_bytes(b"fake-audio")

    merger = TrackingMerger(needs_merge_result=False)
    pipeline = CjkFakePipeline(merger)

    asyncio.run(
        async_mod.run_v2_pipeline_async(
            pipeline,
            FakeMinioClient(),
            audio_path,
            "media-123",
            user_id="user-123",
            started_at=time.time(),
            target_lang="vi",
        )
    )

    assert merger.process_calls == 0
    assert merger.correct_homophones_calls == 0


class FakeProfiler:
    def __init__(self, interval: float = 2.0) -> None:
        self.interval = interval

    def start(self, job_id: str, media_id: str) -> None:
        return None

    def stop(self) -> None:
        return None


def test_worker_process_persists_batch_before_final_completion(monkeypatch) -> None:
    FakeMinioClient.instances.clear()
    worker_events: list[tuple[str, dict]] = []

    monkeypatch.setattr(async_mod, "update_media_status", lambda *args, **kwargs: None)
    monkeypatch.setattr(async_mod, "publish_progress", lambda *args, **kwargs: None)
    monkeypatch.setattr(async_mod, "publish_chunk_ready", lambda *args, **kwargs: None)
    monkeypatch.setattr(async_mod, "publish_batch_ready", lambda *args, **kwargs: None)
    monkeypatch.setattr(async_mod, "NMTTranslator", FakeNMTTranslatorHolder)

    monkeypatch.setattr(main_mod, "MinioClient", FakeMinioClient)
    monkeypatch.setattr(main_mod, "PipelineOrchestrator", FakePipeline)
    monkeypatch.setattr(main_mod, "HardwareProfiler", FakeProfiler)
    monkeypatch.setattr(
        main_mod,
        "update_media_status",
        lambda media_id, **kwargs: worker_events.append(("status", kwargs)),
    )
    monkeypatch.setattr(
        main_mod,
        "publish_completed",
        lambda **kwargs: worker_events.append(("completed", kwargs)),
    )
    monkeypatch.setattr(
        main_mod,
        "publish_failed",
        lambda **kwargs: worker_events.append(("failed", kwargs)),
    )
    monkeypatch.setattr(
        main_mod,
        "mark_quota_counted",
        lambda media_id: worker_events.append(("quota", {"media_id": media_id})),
    )

    job = SimpleNamespace(
        id="job-123",
        data={
            "mediaId": "media-123",
            "audioS3Key": "raw/input.mp3",
            "durationSeconds": 120,
            "userId": "user-123",
            "targetLanguage": "vi",
        },
    )

    asyncio.run(main_mod.process_job(job, token=None))

    assert FakeMinioClient.instances, "worker did not instantiate MinioClient"
    uploads = FakeMinioClient.instances[-1].uploads
    upload_types = [entry["type"] for entry in uploads]

    assert upload_types.index("batch") < upload_types.index("final")
    assert any(kind == "completed" for kind, _payload in worker_events)
    assert any(
        kind == "status" and payload.get("status") == "COMPLETED"
        for kind, payload in worker_events
    )


def test_representative_media_matrix_keeps_demo_audio_2_out_of_standard_baselines() -> (
    None
):
    from src.scripts.test_v2_pipeline import get_media_expectation

    assert (
        get_media_expectation("demo_audio_2.mp3").enforce_chunk_count_equality is False
    )
    assert (
        get_media_expectation("demo_audio_3.mp3").enforce_chunk_count_equality is False
    )
    assert (
        get_media_expectation("demo_audio_4.mp3").enforce_chunk_count_equality is False
    )
