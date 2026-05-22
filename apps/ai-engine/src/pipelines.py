"""
Pipeline mode runners - V2 async NMT-based pipeline.

Single entry point: run_v2_pipeline() delegates to async_pipeline.py
for the full processing run: audio prep -> VAD -> alignment ->
NMT translation -> optional LLM refinement -> export.
"""

from __future__ import annotations

from pathlib import Path

from src.core.pipeline import PipelineOrchestrator
from src.minio_client import MinioClient
from src.schemas import SubtitleOutput


# ============================================================================
# V2 Pipeline (async NMT-based)
# ============================================================================


async def run_v2_pipeline(
    pipeline: PipelineOrchestrator,
    minio_client: MinioClient,
    audio_path: Path,
    media_id: str,
    *,
    user_id: str,
    started_at: float,
    target_lang: str = "vi",
    duration_seconds: float = 0.0,
    source_language_hint: str | None = None,
    media_context: dict[str, str] | None = None,
) -> SubtitleOutput:
    """V2 async pipeline entry point. Delegates to async_pipeline.py."""
    from src.async_pipeline import (
        run_v2_pipeline_async,
    )  # local import avoids circular refs

    return await run_v2_pipeline_async(
        pipeline,
        minio_client,
        audio_path,
        media_id,
        user_id=user_id,
        started_at=started_at,
        target_lang=target_lang,
        duration_seconds=duration_seconds,
        source_language_hint=source_language_hint,
        media_context=media_context,
    )
