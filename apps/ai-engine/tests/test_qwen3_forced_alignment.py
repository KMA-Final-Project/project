from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import numpy as np
import pytest

import src.async_pipeline as async_mod
import src.core.qwen3_forced_aligner as forced_mod
from src.config import Settings
from src.schemas import SegmentType, VADSegment
from tests.test_chinese_batch_llm_translator import (
    _ChineseRescueMinio,
    _ChineseRescueNMT,
    _ChineseRescueNMTHolder,
    _ChineseRescuePipeline,
    _PromptAwareChineseRescueLLM,
    _StubLLM,
    _noop,
    _sentence,
)


def _reset_qwen_provider_singleton() -> None:
    forced_mod.Qwen3ForcedAlignerProvider._instance = None


class _FakeTorch:
    float32 = "float32"

    def __init__(self) -> None:
        self.num_threads: list[int] = []

    def set_num_threads(self, value: int) -> None:
        self.num_threads.append(value)


class _FakeQwenFactory:
    model: "_FakeQwenModel | None" = None
    calls: list[dict[str, Any]] = []

    @classmethod
    def from_pretrained(cls, *args: Any, **kwargs: Any) -> "_FakeQwenModel":
        cls.calls.append({"args": args, "kwargs": kwargs})
        assert cls.model is not None
        return cls.model


class _FakeQwenModel:
    def __init__(self, responses: list[list[SimpleNamespace]]) -> None:
        self.responses = list(responses)
        self.calls: list[dict[str, Any]] = []

    def align(self, **kwargs: Any) -> list[list[SimpleNamespace]]:
        self.calls.append(kwargs)
        return self.responses.pop(0)


class _FakeForcedAligner:
    def __init__(self, plans: dict[str, Any] | None = None) -> None:
        self.plans = dict(plans or {})
        self.ensure_loaded_calls = 0
        self.align_calls: list[dict[str, Any]] = []

    def ensure_loaded(self) -> float:
        self.ensure_loaded_calls += 1
        return 0.05 if self.ensure_loaded_calls == 1 else 0.0

    def align_sentence(
        self,
        *,
        audio,
        sample_rate: int,
        reference_text: str,
        source_lang: str,
        baseline_words=None,
    ):
        baseline = list(baseline_words or [])
        self.align_calls.append(
            {
                "reference_text": reference_text,
                "source_lang": source_lang,
                "sample_rate": sample_rate,
                "audio_len": len(audio),
                "baseline_words": [word.word for word in baseline],
            }
        )
        plan = self.plans.get(reference_text)
        if isinstance(plan, Exception):
            raise plan
        if callable(plan):
            return plan(reference_text, baseline)
        if plan is not None:
            return plan
        step = 0.05
        return [
            SimpleNamespace(
                text=word.word,
                start=index * step,
                end=(index + 1) * step,
            )
            for index, word in enumerate(baseline)
        ]

    @staticmethod
    def normalize_unit_text(text: str) -> str:
        return forced_mod.Qwen3ForcedAlignerProvider.normalize_unit_text(text)


class _FakeForcedAlignerHolder:
    instance: _FakeForcedAligner | None = None

    @classmethod
    def get_instance(cls) -> _FakeForcedAligner:
        assert cls.instance is not None
        return cls.instance


class _PartialAcceptanceLLM(_StubLLM):
    def __init__(self) -> None:
        super().__init__({"segments": []})

    def generate_ollama_structured(
        self,
        prompt: str,
        system_prompt: str,
        response_schema: dict[str, Any],
        **kwargs: Any,
    ) -> tuple[str, dict[str, Any]]:
        self.calls.append(
            {
                "prompt": prompt,
                "system_prompt": system_prompt,
                "response_schema": response_schema,
                "kwargs": kwargs,
            }
        )
        target_segments = json.loads(prompt)["target_segments"]
        converted: list[dict[str, Any]] = []
        for item in target_segments:
            raw_text = item["raw_text"]
            if raw_text == "请问你是王静吗":
                punctuated_source = "请问你是王静吗？"
                translation = "Xin hỏi bạn có phải là Vương Tĩnh không?"
            elif raw_text == "你好我是你是李雷吧？":
                punctuated_source = "你好，我是李雷。"
                translation = "Sai cấu trúc."
            else:
                punctuated_source = raw_text
                translation = f"vi:{raw_text}"
            converted.append(
                {
                    "id": item["id"],
                    "punctuated_source": punctuated_source,
                    "translation": translation,
                }
            )
        return json.dumps({"segments": converted}, ensure_ascii=False), {
            "model": kwargs["model_name"],
            "eval_count": 64,
        }


class _LongAudioVADManager:
    def process(self, standardized_path: Path, profile: str = "standard"):
        del standardized_path, profile
        return (
            [
                VADSegment(
                    start=0.0,
                    end=10.0,
                    type=SegmentType.HAPPY_CASE,
                    duration=10.0,
                )
            ],
            Path("long-audio.wav"),
            np.zeros(160000, dtype=np.float32),
        )


class _RecordingChineseRescueMinio(_ChineseRescueMinio):
    def __init__(self) -> None:
        super().__init__()
        self.uploaded_batches: list[Any] = []

    def upload_translated_batch(self, media_id: str, batch) -> tuple[str, str]:
        self.uploaded_batches.append(batch.model_copy(deep=True))
        return super().upload_translated_batch(media_id, batch)


def _configure_runtime(
    monkeypatch,
    *,
    llm,
    forced_aligner: _FakeForcedAligner,
    strategy: str = "qwen3_forced_after_llm",
    route_ids: str = "sensevoice_small",
    max_segment_seconds: float = 20.0,
) -> None:
    _ChineseRescueNMTHolder.translator = _ChineseRescueNMT()
    _FakeForcedAlignerHolder.instance = forced_aligner

    monkeypatch.setattr(async_mod, "update_media_status", _noop)
    monkeypatch.setattr(async_mod, "publish_progress", _noop)
    monkeypatch.setattr(async_mod, "publish_chunk_ready", _noop)
    monkeypatch.setattr(async_mod, "publish_batch_ready", _noop)
    monkeypatch.setattr(async_mod, "NMTTranslator", _ChineseRescueNMTHolder)
    monkeypatch.setattr(async_mod, "Qwen3ForcedAlignerProvider", _FakeForcedAlignerHolder)
    monkeypatch.setattr(async_mod.settings, "AI_ENABLE_LLM_REFINEMENT", False)
    monkeypatch.setattr(async_mod.settings, "AI_CHINESE_LLM_RESCUE_ENABLED", True)
    monkeypatch.setattr(async_mod.settings, "AI_CHINESE_LINGUISTIC_RADAR_ENABLED", True)
    monkeypatch.setattr(async_mod.settings, "AI_CHINESE_LLM_RESCUE_SPLIT_HINTS_ENABLED", True)
    monkeypatch.setattr(async_mod.settings, "AI_TRANSLATION_START_POLICY", "during_asr")
    monkeypatch.setattr(async_mod.settings, "AI_ENABLE_NMT_PREFETCH", False)
    monkeypatch.setattr(async_mod.settings, "AI_CHINESE_ALIGNMENT_STRATEGY", strategy)
    monkeypatch.setattr(async_mod.settings, "AI_QWEN3_FORCE_ALIGNER_ROUTE_IDS", route_ids)
    monkeypatch.setattr(
        async_mod.settings,
        "AI_QWEN3_FORCE_ALIGNER_MAX_SEGMENT_SECONDS",
        max_segment_seconds,
    )


def _run_pipeline(
    monkeypatch,
    tmp_path,
    *,
    llm,
    forced_aligner: _FakeForcedAligner,
    strategy: str = "qwen3_forced_after_llm",
    route_ids: str = "sensevoice_small",
    max_segment_seconds: float = 20.0,
    minio: _ChineseRescueMinio | None = None,
):
    _configure_runtime(
        monkeypatch,
        llm=llm,
        forced_aligner=forced_aligner,
        strategy=strategy,
        route_ids=route_ids,
        max_segment_seconds=max_segment_seconds,
    )
    pipeline = _ChineseRescuePipeline(llm)
    pipeline.vad_manager = _LongAudioVADManager()
    minio = minio or _ChineseRescueMinio()
    audio_path = tmp_path / "input.wav"
    audio_path.write_bytes(b"fake-audio")
    output = asyncio.run(
        async_mod.run_v2_pipeline_async(
            pipeline,
            minio,
            audio_path,
            "media-qwen3-zh-123",
            user_id="user-123",
            started_at=time.time(),
            target_lang="vi",
            media_context={
                "title": "Mandarin Chinese lesson for beginners",
                "audioS3Key": "uploads/dialogue_sample.mp3",
            },
        )
    )
    return output, pipeline, minio


def test_qwen3_force_alignment_config_defaults(monkeypatch) -> None:
    monkeypatch.delenv("AI_CHINESE_ALIGNMENT_STRATEGY", raising=False)
    monkeypatch.delenv("AI_QWEN3_FORCE_ALIGNER_DEVICE", raising=False)
    monkeypatch.delenv("AI_QWEN3_FORCE_ALIGNER_ROUTE_IDS", raising=False)

    config = Settings(_env_file=None)

    assert config.chinese_alignment_strategy == "linear_smeared"
    assert config.qwen3_force_aligner_device == "cpu"
    assert config.qwen3_force_aligner_route_ids == frozenset({"sensevoice_small"})


def test_qwen3_force_alignment_config_normalizes_device_and_routes(monkeypatch) -> None:
    monkeypatch.setenv("AI_QWEN3_FORCE_ALIGNER_DEVICE", "cuda:0")
    monkeypatch.setenv(
        "AI_QWEN3_FORCE_ALIGNER_ROUTE_IDS",
        "sensevoice_small, paraformer_zh ",
    )

    config = Settings(_env_file=None)

    assert config.qwen3_force_aligner_device == "cpu"
    assert config.qwen3_force_aligner_route_ids == frozenset(
        {"sensevoice_small", "paraformer_zh"}
    )


def test_qwen3_forced_aligner_provider_uses_cpu_and_language_mapping(
    monkeypatch,
    tmp_path,
) -> None:
    _reset_qwen_provider_singleton()
    fake_torch = _FakeTorch()
    fake_model = _FakeQwenModel(
        [
            [
                SimpleNamespace(
                    items=[
                        SimpleNamespace(text="你", start_time=0.0, end_time=0.1),
                        SimpleNamespace(text="好", start_time=0.1, end_time=0.2),
                    ]
                )
            ],
            [
                SimpleNamespace(
                    items=[
                        SimpleNamespace(text="係", start_time=0.0, end_time=0.1),
                        SimpleNamespace(text="咪", start_time=0.1, end_time=0.2),
                    ]
                )
            ],
        ]
    )
    _FakeQwenFactory.model = fake_model
    _FakeQwenFactory.calls = []

    monkeypatch.setitem(sys.modules, "torch", fake_torch)
    monkeypatch.setitem(
        sys.modules,
        "qwen_asr",
        SimpleNamespace(Qwen3ForcedAligner=_FakeQwenFactory),
    )
    monkeypatch.setattr(
        forced_mod.settings,
        "AI_QWEN3_FORCE_ALIGNER_DEVICE",
        "cuda:0",
    )
    monkeypatch.setattr(
        forced_mod.settings,
        "AI_QWEN3_FORCE_ALIGNER_CACHE_DIR",
        tmp_path,
    )
    monkeypatch.setattr(
        forced_mod.settings,
        "AI_QWEN3_FORCE_ALIGNER_NUM_THREADS",
        0,
    )

    provider = forced_mod.Qwen3ForcedAlignerProvider.get_instance()
    provider.align_sentence(
        audio=[0.0, 0.0],
        sample_rate=16000,
        reference_text="你好",
        source_lang="zh",
        baseline_words=[],
    )
    provider.align_sentence(
        audio=[0.0, 0.0],
        sample_rate=16000,
        reference_text="係咪",
        source_lang="yue",
        baseline_words=[],
    )

    assert _FakeQwenFactory.calls
    assert _FakeQwenFactory.calls[0]["args"] == (
        "Qwen/Qwen3-ForcedAligner-0.6B",
    )
    assert _FakeQwenFactory.calls[0]["kwargs"]["device_map"] == "cpu"
    assert Path(_FakeQwenFactory.calls[0]["kwargs"]["cache_dir"]).resolve() == tmp_path.resolve()
    assert fake_torch.num_threads == [min(8, os.cpu_count() or 1)]
    assert fake_model.calls[0]["language"] == "Chinese"
    assert fake_model.calls[1]["language"] == "Cantonese"
    assert provider.last_unit_count == 2


def test_qwen3_force_alignment_strategy_off_skips_provider(monkeypatch, tmp_path) -> None:
    forced_aligner = _FakeForcedAligner()

    _run_pipeline(
        monkeypatch,
        tmp_path,
        llm=_PromptAwareChineseRescueLLM(),
        forced_aligner=forced_aligner,
        strategy="linear_smeared",
    )

    assert forced_aligner.ensure_loaded_calls == 0
    assert forced_aligner.align_calls == []


def test_qwen3_force_alignment_overlays_timestamps_only(monkeypatch, tmp_path) -> None:
    forced_aligner = _FakeForcedAligner()

    output, pipeline, _minio = _run_pipeline(
        monkeypatch,
        tmp_path,
        llm=_PromptAwareChineseRescueLLM(),
        forced_aligner=forced_aligner,
    )

    question = output.segments[2]
    assert question.text == "请问你是王静吗？"
    assert question.translation == "Xin hỏi bạn có phải là Vương Tĩnh không?"
    assert question.words[0].start == pytest.approx(4.2)
    assert question.words[0].end == pytest.approx(4.25)
    assert question.start == pytest.approx(4.2)
    assert question.end == pytest.approx(4.55)
    assert question.words[0].confidence == 0.95
    assert (
        pipeline.last_run_metrics["chinese_forced_alignment"]["aligned_segments"]
        == len(output.segments)
    )
    assert len(forced_aligner.align_calls) == len(output.segments)


def test_qwen3_force_alignment_updates_translated_batch_artifact_before_upload(
    monkeypatch,
    tmp_path,
) -> None:
    forced_aligner = _FakeForcedAligner()
    minio = _RecordingChineseRescueMinio()

    output, pipeline, _minio = _run_pipeline(
        monkeypatch,
        tmp_path,
        llm=_PromptAwareChineseRescueLLM(),
        forced_aligner=forced_aligner,
        minio=minio,
    )

    assert len(minio.uploaded_batches) == 1
    uploaded_question = minio.uploaded_batches[0].segments[2]
    assert uploaded_question.text == "请问你是王静吗？"
    assert uploaded_question.words[0].start == pytest.approx(4.2)
    assert uploaded_question.words[0].end == pytest.approx(4.25)
    assert uploaded_question.model_dump() == output.segments[2].model_dump()
    assert (
        pipeline.last_run_metrics["chinese_forced_alignment"]["aligned_segments"]
        == len(output.segments)
    )


def test_qwen3_force_alignment_ignores_punctuation_only_baseline_tokens(
    monkeypatch,
) -> None:
    sentence = _sentence("你好，我是。", 4.2, 5.0, ["你", "好", "，", "我", "是", "。"])
    forced_aligner = _FakeForcedAligner(
        plans={
            "你好，我是。": [
                SimpleNamespace(text="你", start=0.0, end=0.05),
                SimpleNamespace(text="好", start=0.05, end=0.10),
                SimpleNamespace(text="我", start=0.10, end=0.15),
                SimpleNamespace(text="是", start=0.15, end=0.20),
            ]
        }
    )
    _FakeForcedAlignerHolder.instance = forced_aligner

    monkeypatch.setattr(async_mod, "Qwen3ForcedAlignerProvider", _FakeForcedAlignerHolder)
    monkeypatch.setattr(
        async_mod.settings,
        "AI_CHINESE_ALIGNMENT_STRATEGY",
        "qwen3_forced_after_llm",
    )
    monkeypatch.setattr(
        async_mod.settings,
        "AI_QWEN3_FORCE_ALIGNER_ROUTE_IDS",
        "sensevoice_small",
    )
    monkeypatch.setattr(
        async_mod.settings,
        "AI_QWEN3_FORCE_ALIGNER_MAX_SEGMENT_SECONDS",
        20.0,
    )

    metrics = async_mod._empty_forced_alignment_metrics()

    async_mod._apply_qwen3_forced_alignment(
        [sentence],
        source_lang="zh",
        actual_route="sensevoice_small",
        audio_array=np.zeros(160000, dtype=np.float32),
        metrics=metrics,
    )

    assert [word.word for word in sentence.words] == ["你", "好", "，", "我", "是", "。"]
    assert sentence.words[0].start == pytest.approx(4.2)
    assert sentence.words[1].start == pytest.approx(4.25)
    assert sentence.words[2].start == pytest.approx(sentence.words[1].start)
    assert sentence.words[2].end == pytest.approx(sentence.words[1].end)
    assert sentence.words[4].end == pytest.approx(4.4)
    assert sentence.words[5].start == pytest.approx(sentence.words[4].start)
    assert sentence.words[5].end == pytest.approx(sentence.words[4].end)
    assert sentence.start == pytest.approx(4.2)
    assert sentence.end == pytest.approx(4.4)
    assert metrics["aligned_segments"] == 1
    assert metrics["downgraded_segments"] == 0


def test_qwen3_force_alignment_maps_mixed_granularity_by_character_index(
    monkeypatch,
) -> None:
    sentence = _sentence(
        "Ｆirst blind date.",
        1.0,
        3.0,
        ["F", "i", "r", "s", "t", "b", "l", "i", "n", "d", "d", "a", "t", "e", "."],
    )
    forced_aligner = _FakeForcedAligner(
        plans={
            "Ｆirst blind date.": [
                SimpleNamespace(text="FIRST", start=0.0, end=0.5),
                SimpleNamespace(text="blind", start=0.5, end=1.1),
                SimpleNamespace(text="date", start=1.1, end=1.6),
            ]
        }
    )
    _FakeForcedAlignerHolder.instance = forced_aligner

    monkeypatch.setattr(async_mod, "Qwen3ForcedAlignerProvider", _FakeForcedAlignerHolder)
    monkeypatch.setattr(
        async_mod.settings,
        "AI_CHINESE_ALIGNMENT_STRATEGY",
        "qwen3_forced_after_llm",
    )
    monkeypatch.setattr(
        async_mod.settings,
        "AI_QWEN3_FORCE_ALIGNER_ROUTE_IDS",
        "sensevoice_small",
    )
    monkeypatch.setattr(
        async_mod.settings,
        "AI_QWEN3_FORCE_ALIGNER_MAX_SEGMENT_SECONDS",
        20.0,
    )

    metrics = async_mod._empty_forced_alignment_metrics()

    async_mod._apply_qwen3_forced_alignment(
        [sentence],
        source_lang="zh",
        actual_route="sensevoice_small",
        audio_array=np.zeros(160000, dtype=np.float32),
        metrics=metrics,
    )

    assert [word.word for word in sentence.words] == ["Ｆirst", "blind", "date", "."]
    assert sentence.words[0].start == pytest.approx(1.0)
    assert sentence.words[0].end == pytest.approx(1.5)
    assert sentence.words[1].start == pytest.approx(1.5)
    assert sentence.words[1].end == pytest.approx(2.1)
    assert sentence.words[2].start == pytest.approx(2.1)
    assert sentence.words[2].end == pytest.approx(2.6)
    assert sentence.words[3].start == pytest.approx(sentence.words[2].start)
    assert sentence.words[3].end == pytest.approx(sentence.words[2].end)
    assert sentence.start == pytest.approx(1.0)
    assert sentence.end == pytest.approx(2.6)
    assert metrics["aligned_segments"] == 1
    assert metrics["downgraded_segments"] == 0


def test_qwen3_force_alignment_global_final_pass_aligns_partial_rescue_output(
    monkeypatch,
    tmp_path,
) -> None:
    forced_aligner = _FakeForcedAligner()

    output, pipeline, _minio = _run_pipeline(
        monkeypatch,
        tmp_path,
        llm=_PartialAcceptanceLLM(),
        forced_aligner=forced_aligner,
    )

    assert len(forced_aligner.align_calls) == len(output.segments)
    assert output.segments[3].translation == "vi:你好我是你是李雷吧？"
    assert (
        pipeline.last_run_metrics["chinese_forced_alignment"]["aligned_segments"]
        == len(output.segments)
    )


def test_qwen3_force_alignment_partial_match_overlays_and_keeps_skipped_chars_baseline(
    monkeypatch,
    tmp_path,
) -> None:
    forced_aligner = _FakeForcedAligner(
        plans={
                "请问你是王静吗？": lambda _text, baseline: [
                SimpleNamespace(text="错", start=0.0, end=0.05),
                *[
                    SimpleNamespace(
                        text=word.word,
                        start=(index + 1) * 0.05,
                        end=(index + 2) * 0.05,
                    )
                    for index, word in enumerate(baseline[1:])
                ],
            ]
        }
    )

    output, pipeline, _minio = _run_pipeline(
        monkeypatch,
        tmp_path,
        llm=_PromptAwareChineseRescueLLM(),
        forced_aligner=forced_aligner,
    )

    question = output.segments[2]
    assert question.text == "请问你是王静吗？"
    assert question.translation == "Xin hỏi bạn có phải là Vương Tĩnh không?"
    assert question.words[0].start == pytest.approx(4.2)
    assert question.words[1].start == pytest.approx(4.25)
    assert question.words[-1].end == pytest.approx(4.55)
    assert pipeline.last_run_metrics["chinese_forced_alignment"]["aligned_segments"] >= 1
    assert pipeline.last_run_metrics["chinese_forced_alignment"]["downgraded_segments"] == 0


def test_qwen3_force_alignment_low_match_rate_downgrades_timing_only(
    monkeypatch,
    tmp_path,
) -> None:
    forced_aligner = _FakeForcedAligner(
        plans={
            "请问你是王静吗？": [
                SimpleNamespace(text="错", start=0.0, end=0.05),
                SimpleNamespace(text="误", start=0.05, end=0.1),
            ]
        }
    )

    output, pipeline, _minio = _run_pipeline(
        monkeypatch,
        tmp_path,
        llm=_PromptAwareChineseRescueLLM(),
        forced_aligner=forced_aligner,
    )

    question = output.segments[2]
    assert question.text == "请问你是王静吗？"
    assert question.translation == "Xin hỏi bạn có phải là Vương Tĩnh không?"
    assert question.words[0].start == pytest.approx(4.2)
    assert question.words[-1].end == pytest.approx(6.6)
    assert pipeline.last_run_metrics["chinese_forced_alignment"]["downgraded_segments"] >= 1
    assert (
        pipeline.last_run_metrics["chinese_forced_alignment"]["failure_reasons"][
            "match_rate_too_low"
        ]
        >= 1
    )


def test_qwen3_force_alignment_provider_exception_downgrades_timing_only(
    monkeypatch,
    tmp_path,
) -> None:
    forced_aligner = _FakeForcedAligner(
        plans={"请问你是王静吗？": RuntimeError("align boom")}
    )

    output, pipeline, _minio = _run_pipeline(
        monkeypatch,
        tmp_path,
        llm=_PromptAwareChineseRescueLLM(),
        forced_aligner=forced_aligner,
    )

    question = output.segments[2]
    assert question.text == "请问你是王静吗？"
    assert question.translation == "Xin hỏi bạn có phải là Vương Tĩnh không?"
    assert question.words[0].start == pytest.approx(4.2)
    assert question.words[-1].end == pytest.approx(6.6)
    assert pipeline.last_run_metrics["chinese_forced_alignment"]["downgraded_segments"] >= 1
    assert (
        pipeline.last_run_metrics["chinese_forced_alignment"]["failure_reasons"][
            "provider_error"
        ]
        >= 1
    )


def test_qwen3_force_alignment_route_not_allowlisted_skips(monkeypatch, tmp_path) -> None:
    forced_aligner = _FakeForcedAligner()

    _output, pipeline, _minio = _run_pipeline(
        monkeypatch,
        tmp_path,
        llm=_PromptAwareChineseRescueLLM(),
        forced_aligner=forced_aligner,
        route_ids="whisper_full",
    )

    assert forced_aligner.align_calls == []
    assert pipeline.last_run_metrics["chinese_forced_alignment"]["attempted_segments"] == 0
    assert (
        pipeline.last_run_metrics["chinese_forced_alignment"]["failure_reasons"][
            "route_not_allowlisted"
        ]
        >= 1
    )


def test_qwen3_force_alignment_overlong_segments_are_skipped(monkeypatch, tmp_path) -> None:
    forced_aligner = _FakeForcedAligner()

    output, pipeline, _minio = _run_pipeline(
        monkeypatch,
        tmp_path,
        llm=_PromptAwareChineseRescueLLM(),
        forced_aligner=forced_aligner,
        max_segment_seconds=1.0,
    )

    assert len(forced_aligner.align_calls) == 1
    assert (
        pipeline.last_run_metrics["chinese_forced_alignment"]["failure_reasons"][
            "segment_too_long"
        ]
        == len(output.segments) - 1
    )


def test_qwen3_force_alignment_global_final_pass_aligns_fallback_and_nmt_output(
    monkeypatch,
    tmp_path,
) -> None:
    forced_aligner = _FakeForcedAligner()

    output, pipeline, _minio = _run_pipeline(
        monkeypatch,
        tmp_path,
        llm=_StubLLM(error=RuntimeError("ollama boom")),
        forced_aligner=forced_aligner,
    )

    assert len(forced_aligner.align_calls) == len(output.segments)
    assert (
        pipeline.last_run_metrics["chinese_forced_alignment"]["aligned_segments"]
        == len(output.segments)
    )
