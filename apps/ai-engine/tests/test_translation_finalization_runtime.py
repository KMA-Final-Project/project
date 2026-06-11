import asyncio
import time

from src.core.translation_finalization_execution import (
    execute_finalization_window,
)
from src.core.translation_revision_overlay import TranslationRevisionOverlay
from src.core.translation_revision_windowing import FinalizationWindow
from src.core.llm_provider import FinalizationLLMResult
from src.schemas import Sentence, Word


def make_sentence(index: int, text: str, start: float, end: float) -> Sentence:
    return Sentence(
        text=text,
        start=start,
        end=end,
        words=[Word(word=text, start=start, end=end, confidence=0.9)],
        translation=f"draft-{index}",
        segment_index=index,
    )


def make_window() -> FinalizationWindow:
    sentences = [make_sentence(0, "hello there", 0.0, 1.0), make_sentence(1, "general kenobi", 1.0, 2.0)]
    return FinalizationWindow(
        revision_index=0,
        window_start_segment_index=0,
        window_end_segment_index=1,
        core_start_segment_index=0,
        core_end_segment_index=1,
        halo_before_sentences=[],
        core_sentences=sentences,
        halo_after_sentences=[],
        source_token_count=4,
        duration_seconds=2.0,
        is_eof_flush=False,
        source_hash="abc123",
    )


def test_execute_window_aggregates_usage() -> None:
    overlay = TranslationRevisionOverlay()

    def invoke(**kwargs):
        return FinalizationLLMResult(
            payload={
                "segments": [
                    {"segment_index": 0, "translation": "xin chao"},
                    {"segment_index": 1, "translation": "rat vui gap"},
                ]
            },
            model="gpt-4.1-mini",
            prompt_tokens=100,
            completion_tokens=25,
            total_tokens=125,
        )

    result = asyncio.run(
        execute_finalization_window(
            window=make_window(),
            source_language="en",
            target_language="vi",
            provider="openai",
            model="gpt-4.1-mini",
            timeout_seconds=5,
            max_retries=0,
            deadline_monotonic=time.monotonic() + 10.0,
            input_price_per_1m=0.4,
            output_price_per_1m=1.6,
            overlay=overlay,
            invoke=invoke,
        )
    )

    assert result.status == "valid"
    assert result.artifact is not None
    assert result.artifact.prompt_tokens == 100
    assert result.artifact.completion_tokens == 25
    assert result.artifact.total_tokens == 125
    assert result.artifact.estimated_cost_usd > 0


def test_execute_window_retries_once_then_succeeds() -> None:
    overlay = TranslationRevisionOverlay()
    attempts = {"count": 0}

    def invoke(**kwargs):
        attempts["count"] += 1
        if attempts["count"] == 1:
            raise RuntimeError("transient")
        return FinalizationLLMResult(
            payload={
                "segments": [
                    {"segment_index": 0, "translation": "xin chao"},
                    {"segment_index": 1, "translation": "rat vui gap"},
                ]
            },
            model="gpt-4.1-mini",
            prompt_tokens=80,
            completion_tokens=20,
            total_tokens=100,
        )

    result = asyncio.run(
        execute_finalization_window(
            window=make_window(),
            source_language="en",
            target_language="vi",
            provider="openai",
            model="gpt-4.1-mini",
            timeout_seconds=5,
            max_retries=1,
            deadline_monotonic=time.monotonic() + 10.0,
            input_price_per_1m=0.4,
            output_price_per_1m=1.6,
            overlay=overlay,
            invoke=invoke,
        )
    )

    assert result.status == "valid"
    assert attempts["count"] == 2
    assert result.artifact is not None
    assert result.artifact.attempt_count == 2


def test_execute_window_times_out() -> None:
    overlay = TranslationRevisionOverlay()

    def invoke(**kwargs):
        time.sleep(0.05)
        return FinalizationLLMResult(
            payload={"segments": []},
            model="gpt-4.1-mini",
            prompt_tokens=0,
            completion_tokens=0,
            total_tokens=0,
        )

    result = asyncio.run(
        execute_finalization_window(
            window=make_window(),
            source_language="en",
            target_language="vi",
            provider="openai",
            model="gpt-4.1-mini",
            timeout_seconds=0,
            max_retries=0,
            deadline_monotonic=time.monotonic() + 10.0,
            input_price_per_1m=0.4,
            output_price_per_1m=1.6,
            overlay=overlay,
            invoke=invoke,
        )
    )

    assert result.status == "timed_out"
