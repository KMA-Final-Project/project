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

import redis
from src.config import settings
from src.minio_client import MinioClient
from src.core.pipeline import PipelineOrchestrator
from src.schemas import (
    Sentence, SubtitleMetadata, SubtitleOutput, TranslatedBatch, TranslatedSentence,
)
from src.utils.hardware_profiler import HardwareProfiler

# ============================================================================
# Redis Client for Pub/Sub
# ============================================================================
redis_client = redis.Redis(
    host=settings.REDIS_HOST,
    port=settings.REDIS_PORT,
    password=settings.REDIS_PASSWORD or None,
    decode_responses=True
)

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
    user_id: str | None = None,
    status: str | None = None,
    progress: float | None = None,
    current_step: str | None = None,
    estimated_time_remaining: int | None = None,
    source_language: str | None = None,
    transcript_s3_key: str | None = None,
    subtitle_s3_key: str | None = None,
    fail_reason: str | None = None,
    # Sentinel to explicitly NULL out a nullable column
    clear_step: bool = False,
) -> None:
    """
    Update MediaItem directly in PostgreSQL.

    We use a direct DB connection (not via NestJS) because:
    1. The AI Engine runs as a separate Python process
    2. Progress updates need low latency (no HTTP round-trip)
    3. psycopg2 is lightweight and reliable

    Pass clear_step=True to set current_step and estimated_time_remaining to NULL
    (used when the job finishes or fails).
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
    if current_step is not None:
        set_clauses.append("current_step = %s")
        values.append(current_step)
    if clear_step:
        set_clauses.append("current_step = NULL")
        set_clauses.append("estimated_time_remaining = NULL")
    elif estimated_time_remaining is not None:
        set_clauses.append("estimated_time_remaining = %s")
        values.append(estimated_time_remaining)
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
        
        # Publish update event to Redis for NestJS WebSockets
        if user_id:
            logger.debug(f"Publishing media_updated event for {media_id}")
            redis_client.publish("media_updates", json.dumps({
                "mediaId": media_id,
                "userId": user_id
            }))
            
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
        import time as _time
        started_at = _time.time()

        if processing_mode == "TRANSCRIBE":
            subtitle_output = run_transcribe_pipeline(
                pipeline, minio_client, local_audio, media_id,
                user_id=user_id, started_at=started_at,
                duration_seconds=duration_seconds,
            )
        else:
            target_lang = job_data.get("targetLanguage", "vi")
            subtitle_output = run_transcribe_translate_pipeline(
                pipeline, minio_client, local_audio, media_id,
                user_id=user_id, started_at=started_at, target_lang=target_lang,
                duration_seconds=duration_seconds,
            )

        # 3. Upload final result
        transcript_key = minio_client.upload_final_result(media_id, subtitle_output)

        # 4. Mark as completed — clear step/ETA fields
        update_media_status(
            media_id,
            user_id=user_id,
            status="COMPLETED",
            progress=1.0,
            transcript_s3_key=transcript_key,
            clear_step=True,
        )
        mark_quota_counted(media_id)

        logger.success(
            f"✅ Job {job.id} completed | media: {media_id} | "
            f"{len(subtitle_output.segments)} segments"
        )

    except Exception as e:
        logger.error(f"❌ Job {job.id} failed | media: {media_id} | {e}")
        update_media_status(
            media_id,
            user_id=user_id,
            status="FAILED",
            fail_reason=str(e)[:500],  # Truncate long error messages
            clear_step=True,
        )
        raise  # Re-raise so BullMQ marks the job as failed

    finally:
        # Stop profiler (writes report even on failure)
        profiler.stop()
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
    *,
    user_id: str,
    started_at: float,
    duration_seconds: float = 0.0,
) -> SubtitleOutput:
    """
    TRANSCRIBE mode: VAD → Alignment → Phonemes (no translation, no LLM).
    Streams chunks to MinIO during alignment for real-time mobile UX.
    Reports current_step + estimated_time_remaining at each phase.
    """
    import time as _time

    def _eta(progress: float) -> int | None:
        """Estimate seconds remaining from elapsed time + current progress."""
        if progress <= 0:
            return None
        elapsed = _time.time() - started_at
        return max(0, int((elapsed / progress) - elapsed))

    logger.info("📝 Running TRANSCRIBE pipeline (no translation)")

    # Step 1: Audio Standardization
    update_media_status(media_id, user_id=user_id, progress=0.05, current_step="AUDIO_PREP", estimated_time_remaining=_eta(0.05))
    meta = pipeline.audio_processor.process(audio_path)
    standardized_path = meta.path

    # Step 2: Audio Inspection
    update_media_status(media_id, user_id=user_id, progress=0.10, current_step="INSPECTING", estimated_time_remaining=_eta(0.10))
    profile = pipeline.audio_inspector.inspect(standardized_path)
    logger.info(f"Audio profile: {profile}")

    # Step 3: VAD & Isolation
    update_media_status(media_id, user_id=user_id, progress=0.15, current_step="VAD", estimated_time_remaining=_eta(0.15))
    segments, clean_audio_path = pipeline.vad_manager.process(
        standardized_path, profile=profile
    )

    if not segments:
        logger.warning("No speech detected — returning empty result")
        update_media_status(media_id, user_id=user_id, progress=1.0, clear_step=True)
        return SubtitleOutput(
            metadata=SubtitleMetadata(duration=duration_seconds, engine_profile=settings.AI_PERF_MODE.value),
            segments=[],
        )

    # Step 4: Smart Alignment with streaming chunk uploads
    update_media_status(media_id, user_id=user_id, progress=0.25, current_step="TRANSCRIBING", estimated_time_remaining=_eta(0.25))
    chunk_index = [0]  # Mutable counter for closure
    source_lang_detected = [False]

    def on_chunk(batch: list, total_so_far: int):
        """Upload each batch of sentences to MinIO as they're transcribed."""
        batch_data = [s.model_dump() for s in batch]
        minio_client.upload_chunk(media_id, chunk_index[0], batch_data)
        chunk_index[0] += 1

        # Detect source language from first batch
        if not source_lang_detected[0] and batch:
            first_lang = _detect_source_language(batch)
            update_media_status(media_id, user_id=user_id, source_language=first_lang)
            source_lang_detected[0] = True

        # Progress: scale 0.25-0.85 based on sentences produced
        progress = min(0.85, 0.25 + (total_so_far / max(total_so_far + 20, 1)) * 0.60)
        update_media_status(
            media_id,
            user_id=user_id,
            progress=progress,
            current_step="TRANSCRIBING",
            estimated_time_remaining=_eta(progress),
        )
        logger.info(f"📤 Streamed chunk {chunk_index[0]} ({len(batch)} sentences, {total_so_far} total)")

    sentences = pipeline.aligner.process(
        clean_audio_path, segments, profile=profile,
        on_chunk=on_chunk, chunk_size=CHUNK_SIZE,
    )

    # Detect language if not yet detected (e.g. very few sentences)
    source_lang = ""
    if sentences and not source_lang_detected[0]:
        source_lang = _detect_source_language(sentences)
        update_media_status(media_id, user_id=user_id, source_language=source_lang, progress=0.85,
                            current_step="TRANSCRIBING", estimated_time_remaining=_eta(0.85))
    elif source_lang_detected[0]:
        source_lang = _detect_source_language(sentences[:5]) if sentences else ""

    # Generate segment-level phonetics for CJK
    _populate_segment_phonetics(sentences, source_lang)

    # Step 7: Export
    update_media_status(media_id, user_id=user_id, progress=0.95, current_step="EXPORTING", estimated_time_remaining=_eta(0.95))
    model_used = (
        settings.WHISPER_MODEL_FULL if source_lang in settings.WHISPER_CJK_LANGUAGES
        else settings.WHISPER_MODEL_TURBO
    )
    return SubtitleOutput(
        metadata=SubtitleMetadata(
            duration=duration_seconds,
            engine_profile=settings.AI_PERF_MODE.value,
            source_lang=source_lang,
            target_lang="",
            model_used=model_used,
        ),
        segments=sentences,
    )


def run_transcribe_translate_pipeline(
    pipeline: PipelineOrchestrator,
    minio_client: MinioClient,
    audio_path: Path,
    media_id: str,
    *,
    user_id: str,
    started_at: float,
    target_lang: str = "vi",
    duration_seconds: float = 0.0,
) -> SubtitleOutput:
    """
    TRANSCRIBE_TRANSLATE mode: Full pipeline with translation.
    VAD → Alignment (Tier 1 streaming) → Semantic Merge → Translation (Tier 2 streaming) → Final upload.
    Reports current_step + estimated_time_remaining at each phase.
    """
    import time as _time

    def _eta(progress: float) -> int | None:
        """Estimate seconds remaining from elapsed time + current progress."""
        if progress <= 0:
            return None
        elapsed = _time.time() - started_at
        return max(0, int((elapsed / progress) - elapsed))

    logger.info("🌐 Running TRANSCRIBE_TRANSLATE pipeline (full bilingual)")

    # Step 1: Audio Standardization
    update_media_status(media_id, user_id=user_id, progress=0.05, current_step="AUDIO_PREP", estimated_time_remaining=_eta(0.05))
    meta = pipeline.audio_processor.process(audio_path)
    standardized_path = meta.path

    # Step 2: Audio Inspection
    update_media_status(media_id, user_id=user_id, progress=0.10, current_step="INSPECTING", estimated_time_remaining=_eta(0.10))
    profile = pipeline.audio_inspector.inspect(standardized_path)
    logger.info(f"Audio profile: {profile}")

    # Step 3: VAD & Isolation
    update_media_status(media_id, user_id=user_id, progress=0.15, current_step="VAD", estimated_time_remaining=_eta(0.15))
    segments, clean_audio_path = pipeline.vad_manager.process(
        standardized_path, profile=profile
    )

    if not segments:
        logger.warning("No speech detected — returning empty result")
        update_media_status(media_id, user_id=user_id, progress=1.0, clear_step=True)
        return SubtitleOutput(
            metadata=SubtitleMetadata(
                duration=duration_seconds, engine_profile=settings.AI_PERF_MODE.value, target_lang=target_lang,
            ),
            segments=[],
        )

    # Step 4: Smart Alignment with Tier 1 streaming preview chunks
    update_media_status(media_id, user_id=user_id, progress=0.25, current_step="TRANSCRIBING", estimated_time_remaining=_eta(0.25))
    chunk_index = [0]

    def on_chunk(batch: list, total_so_far: int):
        """Upload transcription-only preview chunks during alignment."""
        batch_data = [s.model_dump() for s in batch]
        minio_client.upload_chunk(media_id, chunk_index[0], batch_data)
        chunk_index[0] += 1
        progress = min(0.40, 0.25 + (total_so_far / max(total_so_far + 20, 1)) * 0.15)
        update_media_status(
            media_id,
            user_id=user_id,
            progress=progress,
            current_step="TRANSCRIBING",
            estimated_time_remaining=_eta(progress),
        )
        logger.info(f"📤 Preview chunk {chunk_index[0]} ({len(batch)} sentences, {total_so_far} total)")

    sentences = pipeline.aligner.process(
        clean_audio_path, segments, profile=profile,
        on_chunk=on_chunk, chunk_size=CHUNK_SIZE,
    )

    # Detect source language
    source_lang = _detect_source_language(sentences) if sentences else "en"
    update_media_status(media_id, user_id=user_id, source_language=source_lang, progress=0.40,
                        current_step="TRANSCRIBING", estimated_time_remaining=_eta(0.40))

    # Step 5: Semantic Merge (language-aware, batched)
    context_style = "Song/Music Lyrics" if profile == "music" else "Speech/Dialogue"

    if profile == "music" or len(sentences) > 5:
        update_media_status(media_id, user_id=user_id, progress=0.50, current_step="MERGING", estimated_time_remaining=_eta(0.50))
        try:
            merged_batch_groups = pipeline.merger.process(
                sentences, source_lang=source_lang, context_style=context_style
            )
            # Flatten batch groups into a single sentence list for downstream use
            sentences = [s for group in merged_batch_groups for s in group]
        except Exception as e:
            logger.error(f"Semantic merge failed (continuing): {e}")

    # Step 6: Translation — Tier 2 streaming via on_batch_complete callback
    update_media_status(media_id, user_id=user_id, progress=0.65, current_step="TRANSLATING", estimated_time_remaining=_eta(0.65))

    total_sentences = len(sentences)
    batch_size = 15  # matches TRANSLATION_BATCH_SIZE in translator_engine
    total_batches = max(1, (total_sentences + batch_size - 1) // batch_size)

    def on_batch_complete(batch_idx: int, batch: list[Sentence]) -> None:
        """Tier 2 callback: upload translated batch + update progress."""
        tb = TranslatedBatch(batch_index=batch_idx, segments=batch)
        minio_client.upload_translated_batch(media_id, tb)
        # Scale progress: 0.65 → 0.95 proportionally
        batch_progress = 0.65 + ((batch_idx + 1) / total_batches) * 0.30
        update_media_status(
            media_id,
            user_id=user_id,
            progress=min(0.95, batch_progress),
            current_step="TRANSLATING",
            estimated_time_remaining=_eta(min(0.95, batch_progress)),
        )

    try:
        translated = pipeline.translator.translate(
            sentences=sentences,
            source_lang=source_lang,
            target_lang=target_lang,
            profile=str(profile),
            on_batch_complete=on_batch_complete,
        )
    except Exception as e:
        logger.error(f"Translation failed: {e}")
        translated = sentences
        for s in translated:
            s.translation = "[Translation Error]"

    # Generate segment-level phonetics for CJK source text
    _populate_segment_phonetics(translated, source_lang)

    # Step 7: Export
    update_media_status(media_id, user_id=user_id, progress=0.95, current_step="EXPORTING", estimated_time_remaining=_eta(0.95))
    model_used = (
        settings.WHISPER_MODEL_FULL if source_lang in settings.WHISPER_CJK_LANGUAGES
        else settings.WHISPER_MODEL_TURBO
    )
    return SubtitleOutput(
        metadata=SubtitleMetadata(
            duration=duration_seconds,
            engine_profile=settings.AI_PERF_MODE.value,
            source_lang=source_lang,
            target_lang=target_lang,
            model_used=model_used,
        ),
        segments=translated,
    )


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


def _populate_segment_phonetics(sentences: list[Sentence], source_lang: str) -> None:
    """
    Populate segment-level phonetic field from word-level phonemes (in-place).

    For CJK source: combines word pinyin/kana into a single segment-level string.
    For non-CJK: no-op (phonetic stays empty).
    """
    if source_lang not in ("zh", "ja", "ko"):
        return
    for s in sentences:
        phonemes = [w.phoneme for w in s.words if w.phoneme]
        if phonemes:
            s.phonetic = " ".join(phonemes)


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
