"""
AI Engine Entry Point — Python BullMQ Consumer.

Listens to the `ai-processing` queue and runs the AI pipeline
(VAD → Transcription → optional Translation) for each job.

Usage:
    python -m src.main
"""

from __future__ import annotations

import asyncio
import shutil
import tempfile
import time as _time
from pathlib import Path

from bullmq import Worker
from loguru import logger

from src.config import settings
from src.core.pipeline import PipelineOrchestrator
from src.db import mark_quota_counted, update_media_status
from src.events import publish_completed, publish_failed
from src.minio_client import MinioClient
from src.pipelines import (
    run_transcribe_pipeline,
    run_transcribe_translate_pipeline,
    run_v2_pipeline,
)
from src.utils.hardware_profiler import HardwareProfiler

# ============================================================================
# Constants
# ============================================================================

AI_PROCESSING_QUEUE = "ai-processing"
QUEUE_PREFIX = "bilingual"


# ============================================================================
# Job Processor
# ============================================================================


async def process_job(job, token):
    """
    Process a single AI job from the queue.

    Job data structure (from NestJS Worker):
        mediaId: str
        audioS3Key: str
        processingMode: "TRANSCRIBE" | "TRANSCRIBE_TRANSLATE"
        durationSeconds: int
        userId: str
    """
    job_data = job.data
    media_id = job_data["mediaId"]
    audio_s3_key = job_data["audioS3Key"]
    processing_mode = job_data["processingMode"]
    duration_seconds = job_data.get("durationSeconds", 0)
    user_id = job_data["userId"]

    logger.info(
        f"🚀 Job {job.id} started | media: {media_id} | "
        f"mode: {processing_mode} | duration: {duration_seconds}s"
    )

    # Initialize clients
    minio_client = MinioClient()
    pipeline = PipelineOrchestrator()
    profiler = HardwareProfiler(interval=2.0)

    # Create temp working directory
    work_dir = Path(tempfile.mkdtemp(prefix=f"bilingual-ai-{media_id[:8]}-"))

    try:
        # Start hardware profiling
        profiler.start(job_id=str(job.id), media_id=media_id)

        # 1. Download audio from MinIO
        ext = Path(audio_s3_key).suffix or ".mp3"
        local_audio = work_dir / f"input{ext}"
        minio_client.download_audio(audio_s3_key, local_audio)

        # 2. Run the pipeline — record wall-clock start time for ETA
        started_at = _time.time()

        if settings.USE_V2_PIPELINE:
            target_lang = job_data.get("targetLanguage", "vi")
            subtitle_output = await run_v2_pipeline(
                pipeline,
                minio_client,
                local_audio,
                media_id,
                user_id=user_id,
                started_at=started_at,
                target_lang=target_lang,
                duration_seconds=duration_seconds,
            )
        elif processing_mode == "TRANSCRIBE":
            subtitle_output = run_transcribe_pipeline(
                pipeline,
                minio_client,
                local_audio,
                media_id,
                user_id=user_id,
                started_at=started_at,
                duration_seconds=duration_seconds,
            )
        else:
            target_lang = job_data.get("targetLanguage", "vi")
            subtitle_output = run_transcribe_translate_pipeline(
                pipeline,
                minio_client,
                local_audio,
                media_id,
                user_id=user_id,
                started_at=started_at,
                target_lang=target_lang,
                duration_seconds=duration_seconds,
            )

        # 3. Upload final result
        transcript_key, final_url = minio_client.upload_final_result(
            media_id, subtitle_output
        )

        # 4. Mark as completed — clear step/ETA fields
        update_media_status(
            media_id,
            user_id=user_id,
            status="COMPLETED",
            progress=1.0,
            transcript_s3_key=transcript_key,
            clear_step=True,
        )
        publish_completed(
            media_id=media_id,
            user_id=user_id,
            final_url=final_url,
            segment_count=len(subtitle_output.segments),
            source_lang=subtitle_output.metadata.source_lang or "",
            target_lang=subtitle_output.metadata.target_lang or "",
            s3_key=transcript_key,
        )
        mark_quota_counted(media_id)

        logger.success(
            f"✅ Job {job.id} completed | media: {media_id} | "
            f"{len(subtitle_output.segments)} segments"
        )

    except Exception as e:
        logger.error(f"❌ Job {job.id} failed | media: {media_id} | {e}")
        reason = str(e)[:500]
        update_media_status(
            media_id,
            user_id=user_id,
            status="FAILED",
            fail_reason=reason,
            clear_step=True,
        )
        publish_failed(media_id=media_id, user_id=user_id, reason=reason)
        raise  # Re-raise so BullMQ marks the job as failed

    finally:
        # Stop profiler (writes report even on failure)
        profiler.stop()
        # Clean up temp directory
        shutil.rmtree(work_dir, ignore_errors=True)


# ============================================================================
# Main
# ============================================================================


async def main():
    """Start the AI Engine BullMQ worker."""
    logger.info(f"🤖 {settings.APP_NAME} starting...")
    logger.info(f"   Redis: {settings.REDIS_HOST}:{settings.REDIS_PORT}")
    logger.info(f"   MinIO: {settings.MINIO_ENDPOINT}:{settings.MINIO_PORT}")
    logger.info(f"   Device: {settings.DEVICE} (index {settings.DEVICE_INDEX})")
    logger.info(f"   Mode: {settings.AI_PERF_MODE.value}")

    redis_opts = {
        "host": settings.REDIS_HOST,
        "port": settings.REDIS_PORT,
    }
    if settings.REDIS_PASSWORD:
        redis_opts["password"] = settings.REDIS_PASSWORD

    worker = Worker(
        AI_PROCESSING_QUEUE,
        process_job,
        {
            "connection": redis_opts,
            "prefix": QUEUE_PREFIX,
            "concurrency": 1,  # GPU can only handle one job at a time
            "lockDuration": 600000,  # 10 minutes — audio processing can take a while
            "stalledInterval": 300000,  # Check for stalled jobs every 5 minutes
        },
    )

    logger.info(f"👂 Listening on queue: {AI_PROCESSING_QUEUE}")
    logger.info("   Press Ctrl+C to stop")

    # Keep the worker running
    try:
        while True:
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        logger.info("Shutting down AI Engine worker...")
    finally:
        await worker.close()
        logger.info("Worker stopped.")


if __name__ == "__main__":
    asyncio.run(main())
