"""
AI Engine Entry Point — Python BullMQ Consumer.

Listens to the `ai-processing` queue and runs the AI pipeline
(VAD → Transcription → optional Translation) for each job.

Usage:
    python -m src.main
"""

import asyncio
import json
import shutil
import tempfile
from pathlib import Path
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

import psycopg2
from bullmq import Worker
from loguru import logger

from src.config import settings
from src.minio_client import MinioClient
from src.core.pipeline import PipelineOrchestrator

# ============================================================================
# Constants
# ============================================================================

AI_PROCESSING_QUEUE = "ai-processing"
QUEUE_PREFIX = "bilingual"

# Chunk every N sentences for streaming output
CHUNK_SIZE = 20


# ============================================================================
# Database helper (direct Postgres for status updates)
# ============================================================================

def _get_psycopg2_dsn() -> str:
    """
    Strip Prisma-specific query parameters (like ?schema=public) from
    DATABASE_URL, since psycopg2 doesn't understand them.
    """
    raw = settings.DATABASE_URL
    parsed = urlparse(raw)
    # Keep only params psycopg2 understands (sslmode, connect_timeout, etc.)
    # Remove Prisma-specific ones like 'schema'
    qs = parse_qs(parsed.query)
    qs.pop("schema", None)
    clean_query = urlencode(qs, doseq=True)
    clean_url = urlunparse(parsed._replace(query=clean_query))
    return clean_url

def update_media_status(
    media_id: str,
    *,
    status: str | None = None,
    progress: float | None = None,
    source_language: str | None = None,
    transcript_s3_key: str | None = None,
    subtitle_s3_key: str | None = None,
    fail_reason: str | None = None,
) -> None:
    """
    Update MediaItem directly in PostgreSQL.

    We use a direct DB connection (not via NestJS) because:
    1. The AI Engine runs as a separate Python process
    2. Progress updates need low latency (no HTTP round-trip)
    3. psycopg2 is lightweight and reliable
    """
    if not settings.DATABASE_URL:
        logger.warning("DATABASE_URL not set — skipping DB update")
        return

    set_clauses = []
    values = []

    if status is not None:
        set_clauses.append("status = %s::\"MediaStatus\"")
        values.append(status)
    if progress is not None:
        set_clauses.append("progress = %s")
        values.append(progress)
    if source_language is not None:
        set_clauses.append("source_language = %s")
        values.append(source_language)
    if transcript_s3_key is not None:
        set_clauses.append("transcript_s3_key = %s")
        values.append(transcript_s3_key)
    if subtitle_s3_key is not None:
        set_clauses.append("subtitle_s3_key = %s")
        values.append(subtitle_s3_key)
    if fail_reason is not None:
        set_clauses.append("fail_reason = %s")
        values.append(fail_reason)

    if not set_clauses:
        return

    values.append(media_id)
    sql = f"UPDATE media_items SET {', '.join(set_clauses)} WHERE id = %s"

    try:
        conn = psycopg2.connect(_get_psycopg2_dsn())
        with conn:
            with conn.cursor() as cur:
                cur.execute(sql, values)
        conn.close()
    except Exception as e:
        logger.error(f"DB update failed for media {media_id}: {e}")


def mark_quota_counted(media_id: str) -> None:
    """Mark the MediaItem as counted in the user's quota."""
    if not settings.DATABASE_URL:
        return

    try:
        conn = psycopg2.connect(_get_psycopg2_dsn())
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE media_items SET counted_in_quota = true WHERE id = %s",
                    (media_id,),
                )
        conn.close()
    except Exception as e:
        logger.error(f"Failed to mark quota for media {media_id}: {e}")


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

    logger.info(
        f"🚀 Job {job.id} started | media: {media_id} | "
        f"mode: {processing_mode} | duration: {duration_seconds}s"
    )

    # Initialize clients
    minio_client = MinioClient()
    pipeline = PipelineOrchestrator()

    # Create temp working directory
    work_dir = Path(tempfile.mkdtemp(prefix=f"bilingual-ai-{media_id[:8]}-"))

    try:
        # 1. Download audio from MinIO
        ext = Path(audio_s3_key).suffix or ".mp3"
        local_audio = work_dir / f"input{ext}"
        minio_client.download_audio(audio_s3_key, local_audio)

        # 2. Run the pipeline
        if processing_mode == "TRANSCRIBE":
            result_data = run_transcribe_pipeline(
                pipeline, minio_client, local_audio, media_id
            )
        else:
            result_data = run_transcribe_translate_pipeline(
                pipeline, minio_client, local_audio, media_id
            )

        # 3. Upload final result
        transcript_key = minio_client.upload_final_result(media_id, result_data)

        # 4. Mark as completed
        update_media_status(
            media_id,
            status="COMPLETED",
            progress=1.0,
            transcript_s3_key=transcript_key,
        )
        mark_quota_counted(media_id)

        logger.success(
            f"✅ Job {job.id} completed | media: {media_id} | "
            f"{len(result_data)} sentences"
        )

    except Exception as e:
        logger.error(f"❌ Job {job.id} failed | media: {media_id} | {e}")
        update_media_status(
            media_id,
            status="FAILED",
            fail_reason=str(e)[:500],  # Truncate long error messages
        )
        raise  # Re-raise so BullMQ marks the job as failed

    finally:
        # Clean up temp directory
        shutil.rmtree(work_dir, ignore_errors=True)


# ============================================================================
# Pipeline Modes
# ============================================================================

def run_transcribe_pipeline(
    pipeline: PipelineOrchestrator,
    minio_client: MinioClient,
    audio_path: Path,
    media_id: str,
) -> list[dict]:
    """
    TRANSCRIBE mode: VAD → Alignment → Phonemes (no translation, no LLM).
    Fast path — suitable for real-time subtitle preview.
    """
    logger.info("📝 Running TRANSCRIBE pipeline (no translation)")

    # Step 1: Audio Standardization
    update_media_status(media_id, progress=0.05)
    meta = pipeline.audio_processor.process(audio_path)
    standardized_path = meta.path

    # Step 2: Audio Inspection
    update_media_status(media_id, progress=0.10)
    profile = pipeline.audio_inspector.inspect(standardized_path)
    logger.info(f"Audio profile: {profile}")

    # Step 3: VAD & Isolation
    update_media_status(media_id, progress=0.15)
    segments, clean_audio_path = pipeline.vad_manager.process(
        standardized_path, profile=profile
    )

    if not segments:
        logger.warning("No speech detected — returning empty result")
        update_media_status(media_id, progress=1.0)
        return []

    # Step 4: Smart Alignment (Transcription + Phonemes)
    update_media_status(media_id, progress=0.25)
    sentences = pipeline.aligner.process(clean_audio_path, segments, profile=profile)

    # Detect source language from first sentence
    if sentences:
        first_lang = _detect_source_language(sentences)
        update_media_status(media_id, source_language=first_lang, progress=0.85)

    # Upload streaming chunks
    result_data = [s.model_dump() for s in sentences]
    _upload_chunks(minio_client, media_id, result_data)

    update_media_status(media_id, progress=0.95)
    return result_data


def run_transcribe_translate_pipeline(
    pipeline: PipelineOrchestrator,
    minio_client: MinioClient,
    audio_path: Path,
    media_id: str,
) -> list[dict]:
    """
    TRANSCRIBE_TRANSLATE mode: Full pipeline with translation.
    VAD → Alignment → Semantic Merge → Translation → Phonemes.
    """
    logger.info("🌐 Running TRANSCRIBE_TRANSLATE pipeline (full bilingual)")

    # Step 1: Audio Standardization
    update_media_status(media_id, progress=0.05)
    meta = pipeline.audio_processor.process(audio_path)
    standardized_path = meta.path

    # Step 2: Audio Inspection
    update_media_status(media_id, progress=0.10)
    profile = pipeline.audio_inspector.inspect(standardized_path)
    logger.info(f"Audio profile: {profile}")

    # Step 3: VAD & Isolation
    update_media_status(media_id, progress=0.15)
    segments, clean_audio_path = pipeline.vad_manager.process(
        standardized_path, profile=profile
    )

    if not segments:
        logger.warning("No speech detected — returning empty result")
        update_media_status(media_id, progress=1.0)
        return []

    # Step 4: Smart Alignment
    update_media_status(media_id, progress=0.25)
    sentences = pipeline.aligner.process(clean_audio_path, segments, profile=profile)

    # Detect source language
    source_lang = _detect_source_language(sentences) if sentences else "en"
    update_media_status(media_id, source_language=source_lang, progress=0.40)

    # Step 5: Semantic Merge (optional)
    if profile == "music" or len(sentences) > 5:
        update_media_status(media_id, progress=0.50)
        try:
            sentences = pipeline.merger.process(
                sentences, context_style="Modern/Classical Song"
            )
        except Exception as e:
            logger.error(f"Semantic merge failed (continuing): {e}")

    # Step 6: Translation
    update_media_status(media_id, progress=0.60)
    segments_data = [s.model_dump() for s in sentences]

    try:
        translations = pipeline.translator.process_two_pass(
            segments_data, target_lang="vi"
        )
        for i, sent_data in enumerate(segments_data):
            sent_data["translation"] = (
                translations[i] if i < len(translations) else ""
            )
    except Exception as e:
        logger.error(f"Translation failed: {e}")
        for d in segments_data:
            d["translation"] = "[Translation Error]"

    # Upload streaming chunks
    _upload_chunks(minio_client, media_id, segments_data)

    update_media_status(media_id, progress=0.95)
    return segments_data


# ============================================================================
# Helpers
# ============================================================================

def _detect_source_language(sentences) -> str:
    """
    Detect the source language from transcription results.
    Uses the language detected by Whisper during alignment.
    """
    # SmartAligner stores detected language in the sentence metadata
    # For now, use a simple heuristic based on character analysis
    if not sentences:
        return "en"

    sample_text = " ".join(s.text for s in sentences[:5] if hasattr(s, "text"))

    # CJK character detection
    cjk_count = sum(1 for c in sample_text if "\u4e00" <= c <= "\u9fff")
    if cjk_count > len(sample_text) * 0.3:
        return "zh"

    # Vietnamese diacritics
    vn_chars = set("ăâđêôơưàảãáạằẳẵắặầẩẫấậèẻẽéẹềểễếệìỉĩíịòỏõóọồổỗốộờởỡớợùủũúụừửữứựỳỷỹýỵ")
    vn_count = sum(1 for c in sample_text.lower() if c in vn_chars)
    if vn_count > len(sample_text) * 0.05:
        return "vi"

    return "en"


def _upload_chunks(
    minio_client: MinioClient, media_id: str, data: list[dict]
) -> None:
    """Upload subtitle data in chunks for progressive client display."""
    for i in range(0, len(data), CHUNK_SIZE):
        chunk = data[i: i + CHUNK_SIZE]
        minio_client.upload_chunk(media_id, i // CHUNK_SIZE, chunk)


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
