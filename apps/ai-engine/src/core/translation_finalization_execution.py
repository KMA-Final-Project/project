from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable

from src.core.translation_revision_overlay import TranslationRevisionOverlay
from src.core.translation_revision_windowing import FinalizationWindow
from src.schemas import TranslationRevisionArtifact, TranslationRevisionSegment


@dataclass(frozen=True, slots=True)
class FinalizationWindowUsage:
    provider: str
    model: str
    attempt_count: int
    latency_ms: int
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    estimated_cost_usd: float


@dataclass(frozen=True, slots=True)
class FinalizationWindowExecutionResult:
    status: str
    artifact: TranslationRevisionArtifact | None = None
    failure_reason: str | None = None
    usage: FinalizationWindowUsage | None = None


def estimate_cost_usd(
    *,
    prompt_tokens: int,
    completion_tokens: int,
    input_price_per_1m: float,
    output_price_per_1m: float,
) -> float:
    return round(
        (prompt_tokens / 1_000_000.0) * input_price_per_1m
        + (completion_tokens / 1_000_000.0) * output_price_per_1m,
        8,
    )


async def execute_finalization_window(
    *,
    window: FinalizationWindow,
    source_language: str,
    target_language: str,
    provider: str,
    model: str,
    timeout_seconds: int,
    max_retries: int,
    deadline_monotonic: float,
    input_price_per_1m: float,
    output_price_per_1m: float,
    overlay: TranslationRevisionOverlay,
    invoke: Callable[..., object | None],
) -> FinalizationWindowExecutionResult:
    core_segments = [
        {"segment_index": s.segment_index, "text": s.text, "translation": s.translation}
        for s in window.core_sentences
    ]
    halo_before = [
        {"segment_index": s.segment_index, "text": s.text, "translation": s.translation}
        for s in window.halo_before_sentences
    ]
    halo_after = [
        {"segment_index": s.segment_index, "text": s.text, "translation": s.translation}
        for s in window.halo_after_sentences
    ]

    attempts_allowed = max_retries + 1
    last_failure_reason: str | None = None

    for attempt in range(1, attempts_allowed + 1):
        if time.monotonic() >= deadline_monotonic:
            return FinalizationWindowExecutionResult(
                status="deadline_hit",
                failure_reason="deadline_hit",
            )

        started_at = time.perf_counter()
        try:
            response = await asyncio.wait_for(
                asyncio.to_thread(
                    invoke,
                    source_language=source_language,
                    target_lang=target_language,
                    core_segments=core_segments,
                    halo_before_segments=halo_before,
                    halo_after_segments=halo_after,
                    include_nmt_draft=True,
                ),
                timeout=timeout_seconds,
            )
        except asyncio.TimeoutError:
            last_failure_reason = "timeout"
            if attempt >= attempts_allowed:
                return FinalizationWindowExecutionResult(
                    status="timed_out",
                    failure_reason=last_failure_reason,
                )
            continue
        except Exception as exc:
            last_failure_reason = str(exc)
            if attempt >= attempts_allowed:
                return FinalizationWindowExecutionResult(
                    status="failed",
                    failure_reason=last_failure_reason,
                )
            continue

        if response is None:
            last_failure_reason = "empty_response"
            if attempt >= attempts_allowed:
                return FinalizationWindowExecutionResult(
                    status="failed",
                    failure_reason=last_failure_reason,
                )
            continue

        latency_ms = max(0, int(round((time.perf_counter() - started_at) * 1000)))
        payload_segments = list(getattr(response, "payload", {}).get("segments", []))
        validation = overlay.validate_response_payload(
            expected_indexes=[s.segment_index for s in window.core_sentences],
            payload_segments=payload_segments,
        )

        usage = FinalizationWindowUsage(
            provider=provider,
            model=str(getattr(response, "model", model)),
            attempt_count=attempt,
            latency_ms=latency_ms,
            prompt_tokens=int(getattr(response, "prompt_tokens", 0) or 0),
            completion_tokens=int(getattr(response, "completion_tokens", 0) or 0),
            total_tokens=int(getattr(response, "total_tokens", 0) or 0),
            estimated_cost_usd=estimate_cost_usd(
                prompt_tokens=int(getattr(response, "prompt_tokens", 0) or 0),
                completion_tokens=int(getattr(response, "completion_tokens", 0) or 0),
                input_price_per_1m=input_price_per_1m,
                output_price_per_1m=output_price_per_1m,
            ),
        )

        if validation.status not in {"valid", "partial"}:
            return FinalizationWindowExecutionResult(
                status="invalid",
                failure_reason=validation.failure_reason,
                usage=usage,
            )

        artifact = TranslationRevisionArtifact(
            revision_index=window.revision_index,
            window_start_segment_index=window.window_start_segment_index,
            window_end_segment_index=window.window_end_segment_index,
            core_start_segment_index=window.core_start_segment_index,
            core_end_segment_index=window.core_end_segment_index,
            source_hash=window.source_hash,
            provider=provider,
            model=usage.model,
            status=validation.status,
            validation_score=1.0 if validation.status == "valid" else 0.5,
            created_at=datetime.now(timezone.utc).isoformat(),
            attempt_count=usage.attempt_count,
            latency_ms=usage.latency_ms,
            prompt_tokens=usage.prompt_tokens,
            completion_tokens=usage.completion_tokens,
            total_tokens=usage.total_tokens,
            estimated_cost_usd=usage.estimated_cost_usd,
            segments=[TranslationRevisionSegment(**seg) for seg in validation.accepted_segments],
        )
        return FinalizationWindowExecutionResult(
            status=validation.status,
            artifact=artifact,
            usage=usage,
        )

    return FinalizationWindowExecutionResult(
        status="failed",
        failure_reason=last_failure_reason or "unknown_failure",
    )
