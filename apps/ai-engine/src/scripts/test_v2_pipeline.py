"""
test_v2_pipeline.py — Run the V2 async pipeline directly against local audio files.

Stubs out external dependencies (Redis, PostgreSQL, MinIO) so only
the core pipeline runs: Whisper → NMT → LLM refinement.

Usage:
    cd apps/ai-engine
    python -m src.scripts.test_v2_pipeline                          # default: demo_audio_2.mp3
    python -m src.scripts.test_v2_pipeline demo_audio_3.mp3         # specific file
    python -m src.scripts.test_v2_pipeline demo_audio_4.mp3 --lang en  # target English
"""

from __future__ import annotations

import argparse
import asyncio
import json
import time
import uuid
from pathlib import Path
from unittest.mock import MagicMock

from loguru import logger

# ---------------------------------------------------------------------------
# Stub external dependencies BEFORE importing pipeline code
# ---------------------------------------------------------------------------

# 1. Stub DB (needs PostgreSQL)
import src.db as _db_mod

_progress_log: list[dict] = []


def _fake_update_media_status(media_id: str, **kwargs):
    progress = kwargs.get("progress")
    step = kwargs.get("current_step")
    if progress is not None:
        _progress_log.append({"progress": progress, "step": step})
        logger.debug(f"  [DB stub] progress={progress:.2f}  step={step}")


_db_mod.update_media_status = _fake_update_media_status

# 2. Stub Redis events (needs Redis)
import src.events as _events_mod

_events: list[dict] = []


def _fake_publish_progress(media_id, user_id, progress, step, eta):
    _events.append({"type": "progress", "progress": progress, "step": step})


def _fake_publish_chunk_ready(*, media_id, user_id, chunk_index, url, sentence_count):
    _events.append(
        {"type": "chunk_ready", "chunk": chunk_index, "sentences": sentence_count}
    )
    logger.info(f"  [Event] chunk_ready #{chunk_index}  ({sentence_count} sentences)")


def _fake_publish_batch_ready(
    *, media_id, user_id, batch_index, url, segment_count, progress
):
    _events.append(
        {"type": "batch_ready", "batch": batch_index, "segments": segment_count}
    )
    logger.info(
        f"  [Event] batch_ready #{batch_index}  ({segment_count} segments, progress={progress:.2f})"
    )


_events_mod.publish_progress = _fake_publish_progress
_events_mod.publish_chunk_ready = _fake_publish_chunk_ready
_events_mod.publish_batch_ready = _fake_publish_batch_ready

# 3. Stub MinIO client (needs MinIO server)
import src.minio_client as _minio_mod

_uploads: list[dict] = []
_trace: list[dict] = []


class FakeMinioClient:
    """In-memory stub that records uploads instead of hitting MinIO."""

    def upload_chunk(self, media_id: str, chunk_index: int, data: list[dict]):
        _uploads.append({"type": "chunk", "index": chunk_index, "count": len(data)})
        return (
            f"{media_id}/chunks/{chunk_index}.json",
            f"http://fake/{chunk_index}.json",
        )

    def upload_translated_batch(self, media_id: str, batch):
        _uploads.append(
            {"type": "batch", "index": batch.batch_index, "count": len(batch.segments)}
        )
        return (
            f"{media_id}/translated_batches/{batch.batch_index}.json",
            f"http://fake/batch_{batch.batch_index}.json",
        )

    def upload_final_result(self, media_id: str, output):
        _uploads.append({"type": "final", "segments": len(output.segments)})
        return f"{media_id}/final.json", "http://fake/final.json"


# ---------------------------------------------------------------------------
# Now import the pipeline (after stubs are in place)
# ---------------------------------------------------------------------------
from src.async_pipeline import run_v2_pipeline_async
from src.core.pipeline import PipelineOrchestrator

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
TEST_MEDIA = PROJECT_ROOT / "test-media"
OUTPUT_DIR = PROJECT_ROOT / "outputs" / "test_v2"


async def run_test(audio_filename: str, target_lang: str) -> None:
    _progress_log.clear()
    _events.clear()
    _uploads.clear()
    _trace.clear()

    audio_path = TEST_MEDIA / audio_filename
    if not audio_path.exists():
        logger.error(f"Audio file not found: {audio_path}")
        available = [f.name for f in TEST_MEDIA.iterdir() if f.is_file()]
        logger.info(f"Available files: {available}")
        return

    media_id = f"test-{uuid.uuid4().hex[:8]}"
    user_id = "test-user"
    logger.info(f"{'=' * 60}")
    logger.info(f"V2 Pipeline Test")
    logger.info(f"  Audio:       {audio_path.name}")
    logger.info(f"  Target lang: {target_lang}")
    logger.info(f"  Media ID:    {media_id}")
    logger.info(f"{'=' * 60}")

    # Initialize the real pipeline components (Whisper, LLM, NMT)
    logger.info("Loading models (this may take a moment on first run)...")
    pipeline = PipelineOrchestrator()
    fake_minio = FakeMinioClient()

    t0 = time.time()
    try:
        output = await run_v2_pipeline_async(
            pipeline,
            fake_minio,
            audio_path,
            media_id,
            user_id=user_id,
            started_at=t0,
            target_lang=target_lang,
            debug_trace=_trace,
        )
    except Exception:
        logger.exception("Pipeline failed!")
        return

    elapsed = time.time() - t0
    final_key, _final_url = fake_minio.upload_final_result(media_id, output)

    # ── Print results ─────────────────────────────────────────────────
    logger.info(f"\n{'=' * 60}")
    logger.success(f"Pipeline completed in {elapsed:.1f}s")
    logger.info(f"  Source lang:  {output.metadata.source_lang}")
    logger.info(f"  Target lang:  {output.metadata.target_lang}")
    logger.info(f"  Segments:     {len(output.segments)}")
    logger.info(
        f"  Tier 1 chunks uploaded: {sum(1 for u in _uploads if u['type'] == 'chunk')}"
    )
    logger.info(
        f"  Tier 2 batches uploaded: {sum(1 for u in _uploads if u['type'] == 'batch')}"
    )
    logger.info(f"  Events fired: {len(_events)}")
    logger.info(f"  Final upload key: {final_key}")

    first_batch = next((item for item in _trace if item["event"] == "batch_uploaded"), None)
    pipeline_done = next(
        (item for item in _trace if item["event"] == "pipeline_completed"), None
    )
    if first_batch:
        logger.info(
            f"  First translated batch at: {first_batch['t']:.3f}s "
            f"(batch #{first_batch['batch_index']})"
        )
    if pipeline_done:
        logger.info(f"  Pipeline completed at:   {pipeline_done['t']:.3f}s")
    if first_batch and pipeline_done:
        logger.info(
            f"  First-batch lead time:    {pipeline_done['t'] - first_batch['t']:.3f}s"
        )

    if _trace:
        logger.info(f"\n{'─' * 60}")
        logger.info("Timing checkpoints:")
        logger.info(f"{'─' * 60}")
        for entry in _trace:
            extras = {k: v for k, v in entry.items() if k not in {"event", "t"}}
            logger.info(f"  {entry['t']:>7.3f}s  {entry['event']}  {extras}")

    if output.segments:
        logger.info(f"\n{'─' * 60}")
        logger.info("Sample bilingual segments (first 10):")
        logger.info(f"{'─' * 60}")
        for i, seg in enumerate(output.segments[:10]):
            logger.info(
                f"  [{seg.start:.1f}s - {seg.end:.1f}s]\n"
                f"    SRC: {seg.text}\n"
                f"    TGT: {seg.translation}"
            )

    # ── Save full output as JSON ──────────────────────────────────────
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_file = OUTPUT_DIR / f"{audio_path.stem}_{target_lang}_{media_id}.json"
    out_file.write_text(
        json.dumps(output.model_dump(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    logger.success(f"Full output saved to: {out_file}")


def main():
    parser = argparse.ArgumentParser(
        description="Run the V2 async pipeline against a local test-media file"
    )
    parser.add_argument(
        "audio_file",
        nargs="?",
        default="demo_audio_2.mp3",
        help="Filename inside apps/ai-engine/test-media",
    )
    parser.add_argument(
        "--lang",
        default="vi",
        dest="target_lang",
        help="Target language code",
    )
    args = parser.parse_args()

    asyncio.run(run_test(args.audio_file, args.target_lang))


if __name__ == "__main__":
    main()
