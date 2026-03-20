from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any, Callable

import pytest

import src.async_pipeline as async_mod
import src.main as main_mod
from tests.test_first_batch_streaming import (
    FakeMinioClient,
    FakeNMTTranslatorHolder,
    FakePipeline,
    FakeProfiler,
)


class CallRecorder:
    def __init__(self) -> None:
        self.calls: list[tuple[str, tuple[Any, ...], dict[str, Any]]] = []

    def wrap(self, label: str, func: Callable[..., Any]) -> Callable[..., Any]:
        def wrapped(*args: Any, **kwargs: Any) -> Any:
            self.calls.append((label, args, kwargs))
            return func(*args, **kwargs)

        return wrapped

    def first_index(
        self,
        label: str,
        predicate: Callable[[tuple[Any, ...], dict[str, Any]], bool] | None = None,
    ) -> int:
        for index, (entry_label, args, kwargs) in enumerate(self.calls):
            if entry_label != label:
                continue
            if predicate is None or predicate(args, kwargs):
                return index
        raise AssertionError(f"No recorded call for {label}")


class RaisingAligner:
    def process(
        self,
        file_path,
        segments,
        profile: str = "standard",
        on_chunk=None,
        chunk_size: int = 8,
    ) -> list[Any]:
        raise RuntimeError("aligner boom")


class FailingPipeline(FakePipeline):
    def __init__(self) -> None:
        super().__init__()
        self.aligner = RaisingAligner()


@pytest.fixture(autouse=True)
def clear_fake_minio_instances() -> None:
    FakeMinioClient.instances.clear()


@pytest.fixture
def worker_job() -> SimpleNamespace:
    return SimpleNamespace(
        id="job-123",
        data={
            "mediaId": "media-123",
            "audioS3Key": "raw/input.mp3",
            "processingMode": "TRANSCRIBE_TRANSLATE",
            "durationSeconds": 120,
            "userId": "user-123",
            "targetLanguage": "vi",
        },
    )


def _noop(*args: Any, **kwargs: Any) -> None:
    return None


def _configure_async_pipeline(monkeypatch, recorder: CallRecorder) -> None:
    monkeypatch.setattr(async_mod, "update_media_status", _noop)
    monkeypatch.setattr(async_mod, "publish_progress", _noop)
    monkeypatch.setattr(async_mod, "NMTTranslator", FakeNMTTranslatorHolder)
    monkeypatch.setattr(
        async_mod,
        "publish_chunk_ready",
        recorder.wrap("publish_chunk_ready", _noop),
    )
    monkeypatch.setattr(
        async_mod,
        "publish_batch_ready",
        recorder.wrap("publish_batch_ready", _noop),
    )


def _chunk_index(args: tuple[Any, ...], kwargs: dict[str, Any]) -> int:
    if "chunk_index" in kwargs:
        return kwargs["chunk_index"]
    return args[2]


def _batch_index(args: tuple[Any, ...], kwargs: dict[str, Any]) -> int:
    if "batch_index" in kwargs:
        return kwargs["batch_index"]
    return args[2].batch_index


def test_upload_before_publish_chunk_ready(monkeypatch, tmp_path) -> None:
    recorder = CallRecorder()
    _configure_async_pipeline(monkeypatch, recorder)
    monkeypatch.setattr(
        FakeMinioClient,
        "upload_chunk",
        recorder.wrap("upload_chunk", FakeMinioClient.upload_chunk),
    )

    audio_path = tmp_path / "input.wav"
    audio_path.write_bytes(b"fake-audio")

    asyncio.run(
        async_mod.run_v2_pipeline_async(
            FakePipeline(),
            FakeMinioClient(),
            audio_path,
            "media-123",
            user_id="user-123",
            started_at=0.0,
            target_lang="vi",
        )
    )

    upload_indices = {
        _chunk_index(args, kwargs): index
        for index, (label, args, kwargs) in enumerate(recorder.calls)
        if label == "upload_chunk"
    }
    publish_indices = {
        _chunk_index(args, kwargs): index
        for index, (label, args, kwargs) in enumerate(recorder.calls)
        if label == "publish_chunk_ready"
    }

    assert upload_indices, "expected upload_chunk calls"
    assert publish_indices, "expected publish_chunk_ready calls"
    assert upload_indices.keys() == publish_indices.keys()
    for chunk_index in sorted(upload_indices):
        assert upload_indices[chunk_index] < publish_indices[chunk_index], (
            f"chunk {chunk_index}: upload_chunk must precede publish_chunk_ready"
        )



def test_upload_before_publish_batch_ready(monkeypatch, tmp_path) -> None:
    recorder = CallRecorder()
    _configure_async_pipeline(monkeypatch, recorder)
    monkeypatch.setattr(
        FakeMinioClient,
        "upload_translated_batch",
        recorder.wrap(
            "upload_translated_batch",
            FakeMinioClient.upload_translated_batch,
        ),
    )

    audio_path = tmp_path / "input.wav"
    audio_path.write_bytes(b"fake-audio")

    asyncio.run(
        async_mod.run_v2_pipeline_async(
            FakePipeline(),
            FakeMinioClient(),
            audio_path,
            "media-123",
            user_id="user-123",
            started_at=0.0,
            target_lang="vi",
        )
    )

    upload_indices = {
        _batch_index(args, kwargs): index
        for index, (label, args, kwargs) in enumerate(recorder.calls)
        if label == "upload_translated_batch"
    }
    publish_indices = {
        _batch_index(args, kwargs): index
        for index, (label, args, kwargs) in enumerate(recorder.calls)
        if label == "publish_batch_ready"
    }

    assert upload_indices, "expected upload_translated_batch calls"
    assert publish_indices, "expected publish_batch_ready calls"
    assert upload_indices.keys() == publish_indices.keys()
    for batch_index in sorted(upload_indices):
        assert upload_indices[batch_index] < publish_indices[batch_index], (
            f"batch {batch_index}: upload_translated_batch must precede publish_batch_ready"
        )



def test_upload_final_before_publish_completed(monkeypatch, worker_job) -> None:
    recorder = CallRecorder()
    _configure_async_pipeline(monkeypatch, recorder)

    monkeypatch.setattr(main_mod, "MinioClient", FakeMinioClient)
    monkeypatch.setattr(main_mod, "PipelineOrchestrator", FakePipeline)
    monkeypatch.setattr(main_mod, "HardwareProfiler", FakeProfiler)
    monkeypatch.setattr(main_mod, "update_media_status", _noop)
    monkeypatch.setattr(main_mod, "publish_failed", _noop)
    monkeypatch.setattr(main_mod, "mark_quota_counted", _noop)
    monkeypatch.setattr(
        main_mod,
        "publish_completed",
        recorder.wrap("publish_completed", _noop),
    )
    monkeypatch.setattr(
        FakeMinioClient,
        "upload_final_result",
        recorder.wrap("upload_final_result", FakeMinioClient.upload_final_result),
    )

    asyncio.run(main_mod.process_job(worker_job, token=None))

    upload_final_index = recorder.first_index("upload_final_result")
    publish_completed_index = recorder.first_index("publish_completed")

    assert upload_final_index < publish_completed_index



def test_failed_status_before_publish_failed(monkeypatch, worker_job) -> None:
    recorder = CallRecorder()
    _configure_async_pipeline(monkeypatch, recorder)

    monkeypatch.setattr(main_mod, "MinioClient", FakeMinioClient)
    monkeypatch.setattr(main_mod, "PipelineOrchestrator", FailingPipeline)
    monkeypatch.setattr(main_mod, "HardwareProfiler", FakeProfiler)
    monkeypatch.setattr(main_mod, "publish_completed", _noop)
    monkeypatch.setattr(main_mod, "mark_quota_counted", _noop)
    monkeypatch.setattr(
        main_mod,
        "update_media_status",
        recorder.wrap("update_media_status", _noop),
    )
    monkeypatch.setattr(
        main_mod,
        "publish_failed",
        recorder.wrap("publish_failed", _noop),
    )

    with pytest.raises(RuntimeError, match="aligner boom"):
        asyncio.run(main_mod.process_job(worker_job, token=None))

    failed_status_index = recorder.first_index(
        "update_media_status",
        predicate=lambda _args, kwargs: kwargs.get("status") == "FAILED",
    )
    publish_failed_index = recorder.first_index("publish_failed")

    assert failed_status_index < publish_failed_index
