"""
Pipeline mode runners — TRANSCRIBE and TRANSCRIBE_TRANSLATE.

Each function orchestrates one full processing run: audio prep → VAD →
alignment → (optional) merge + translate → export.  Progress and
streaming events are published as side effects.
"""

from __future__ import annotations

import time as _time
from pathlib import Path

from loguru import logger

from src.config import settings
from src.core.pipeline import PipelineOrchestrator
from src.db import update_media_status
from src.events import (
    publish_chunk_ready,
    publish_progress,
)
from src.incremental_pipeline import IncrementalPipeline
from src.minio_client import MinioClient
from src.schemas import (
    Sentence,
    SubtitleMetadata,
    SubtitleOutput,
    TranslatedSentence,
)

# Chunk every N sentences for streaming output
CHUNK_SIZE = 20


# ============================================================================
# Helpers
# ============================================================================


def _detect_source_language(sentences: list) -> str:
    """
    Detect the source language from transcription results.
    Uses a simple heuristic based on character analysis.
    """
    if not sentences:
        return "en"

    sample_text = " ".join(s.text for s in sentences[:5] if hasattr(s, "text"))

    # CJK character detection
    cjk_count = sum(1 for c in sample_text if "\u4e00" <= c <= "\u9fff")
    if cjk_count > len(sample_text) * 0.3:
        return "zh"

    # Vietnamese diacritics
    vn_chars = set(
        "ăâđêôơưàảãáạằẳẵắặầẩẫấậèẻẽéẹềểễếệìỉĩíịòỏõóọồổỗốộờởỡớợùủũúụừửữứựỳỷỹýỵ"
    )
    vn_count = sum(1 for c in sample_text.lower() if c in vn_chars)
    if vn_count > len(sample_text) * 0.05:
        return "vi"

    return "en"


def _populate_segment_phonetics(
    sentences: list[TranslatedSentence], source_lang: str
) -> None:
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
# TRANSCRIBE mode
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

    def _eta(progress: float) -> int | None:
        if progress <= 0:
            return None
        elapsed = _time.time() - started_at
        return max(0, int((elapsed / progress) - elapsed))

    logger.info("📝 Running TRANSCRIBE pipeline (no translation)")

    # Step 1: Audio Standardization
    update_media_status(
        media_id,
        user_id=user_id,
        progress=0.05,
        current_step="AUDIO_PREP",
        estimated_time_remaining=_eta(0.05),
    )
    publish_progress(media_id, user_id, 0.05, "AUDIO_PREP", _eta(0.05))
    meta = pipeline.audio_processor.process(audio_path)
    standardized_path = meta.path

    # Step 2: Audio Inspection
    update_media_status(
        media_id,
        user_id=user_id,
        progress=0.10,
        current_step="INSPECTING",
        estimated_time_remaining=_eta(0.10),
    )
    publish_progress(media_id, user_id, 0.10, "INSPECTING", _eta(0.10))
    profile = pipeline.audio_inspector.inspect(standardized_path)
    logger.info(f"Audio profile: {profile}")

    # Step 3: VAD & Isolation
    update_media_status(
        media_id,
        user_id=user_id,
        progress=0.15,
        current_step="VAD",
        estimated_time_remaining=_eta(0.15),
    )
    publish_progress(media_id, user_id, 0.15, "VAD", _eta(0.15))
    segments, clean_audio_path = pipeline.vad_manager.process(
        standardized_path, profile=profile
    )

    if not segments:
        logger.warning("No speech detected — returning empty result")
        update_media_status(media_id, user_id=user_id, progress=1.0, clear_step=True)
        return SubtitleOutput(
            metadata=SubtitleMetadata(
                duration=duration_seconds, engine_profile=settings.AI_PERF_MODE.value
            ),
            segments=[],
        )

    # Step 4: Smart Alignment with streaming chunk uploads
    update_media_status(
        media_id,
        user_id=user_id,
        progress=0.25,
        current_step="TRANSCRIBING",
        estimated_time_remaining=_eta(0.25),
    )
    publish_progress(media_id, user_id, 0.25, "TRANSCRIBING", _eta(0.25))
    chunk_index = [0]
    source_lang_detected = [False]

    def on_chunk(batch: list, total_so_far: int):
        """Upload each batch of sentences to MinIO as they're transcribed."""
        batch_data = [s.model_dump() for s in batch]
        idx = chunk_index[0]
        _chunk_key, chunk_url = minio_client.upload_chunk(media_id, idx, batch_data)
        publish_chunk_ready(
            media_id=media_id,
            user_id=user_id,
            chunk_index=idx,
            url=chunk_url,
            sentence_count=len(batch),
        )
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
        publish_progress(media_id, user_id, progress, "TRANSCRIBING", _eta(progress))
        logger.info(
            f"📤 Streamed chunk {chunk_index[0]} ({len(batch)} sentences, {total_so_far} total)"
        )

    sentences = pipeline.aligner.process(
        clean_audio_path,
        segments,
        profile=profile,
        on_chunk=on_chunk,
        chunk_size=CHUNK_SIZE,
    )

    # Detect language if not yet detected (e.g. very few sentences)
    source_lang = ""
    if sentences and not source_lang_detected[0]:
        source_lang = _detect_source_language(sentences)
        update_media_status(
            media_id,
            user_id=user_id,
            source_language=source_lang,
            progress=0.85,
            current_step="TRANSCRIBING",
            estimated_time_remaining=_eta(0.85),
        )
        publish_progress(media_id, user_id, 0.85, "TRANSCRIBING", _eta(0.85))
    elif source_lang_detected[0]:
        source_lang = _detect_source_language(sentences[:5]) if sentences else ""

    # Generate segment-level phonetics for CJK
    _populate_segment_phonetics(sentences, source_lang)

    # Step 5: Export
    update_media_status(
        media_id,
        user_id=user_id,
        progress=0.95,
        current_step="EXPORTING",
        estimated_time_remaining=_eta(0.95),
    )
    publish_progress(media_id, user_id, 0.95, "EXPORTING", _eta(0.95))
    model_used = (
        settings.WHISPER_MODEL_FULL
        if source_lang in settings.WHISPER_CJK_LANGUAGES
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


# ============================================================================
# TRANSCRIBE_TRANSLATE mode
# ============================================================================


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
    TRANSCRIBE_TRANSLATE mode — Incremental pipeline.

    VAD → Alignment (Tier 1 streaming + incremental merge→translate→Tier 2 streaming) → Final upload.
    SemanticMerger and TranslatorEngine run on accumulated chunks as they arrive
    from SmartAligner, not after all transcription completes.
    """

    def _eta(progress: float) -> int | None:
        if progress <= 0:
            return None
        elapsed = _time.time() - started_at
        return max(0, int((elapsed / progress) - elapsed))

    logger.info("🌐 Running TRANSCRIBE_TRANSLATE pipeline (incremental bilingual)")

    # Step 1: Audio Standardization
    update_media_status(
        media_id,
        user_id=user_id,
        progress=0.05,
        current_step="AUDIO_PREP",
        estimated_time_remaining=_eta(0.05),
    )
    publish_progress(media_id, user_id, 0.05, "AUDIO_PREP", _eta(0.05))
    meta = pipeline.audio_processor.process(audio_path)
    standardized_path = meta.path

    # Step 2: Audio Inspection
    update_media_status(
        media_id,
        user_id=user_id,
        progress=0.10,
        current_step="INSPECTING",
        estimated_time_remaining=_eta(0.10),
    )
    publish_progress(media_id, user_id, 0.10, "INSPECTING", _eta(0.10))
    profile = pipeline.audio_inspector.inspect(standardized_path)
    logger.info(f"Audio profile: {profile}")

    # Step 3: VAD & Isolation
    update_media_status(
        media_id,
        user_id=user_id,
        progress=0.15,
        current_step="VAD",
        estimated_time_remaining=_eta(0.15),
    )
    publish_progress(media_id, user_id, 0.15, "VAD", _eta(0.15))
    segments, clean_audio_path = pipeline.vad_manager.process(
        standardized_path, profile=profile
    )

    if not segments:
        logger.warning("No speech detected — returning empty result")
        update_media_status(media_id, user_id=user_id, progress=1.0, clear_step=True)
        return SubtitleOutput(
            metadata=SubtitleMetadata(
                duration=duration_seconds,
                engine_profile=settings.AI_PERF_MODE.value,
                target_lang=target_lang,
            ),
            segments=[],
        )

    # Step 4: Incremental pipeline — Alignment + interleaved Merge→Translate
    context_style = "Song/Music Lyrics" if profile == "music" else "Speech/Dialogue"

    def _on_incremental_progress(progress: float, step: str) -> None:
        update_media_status(
            media_id,
            user_id=user_id,
            progress=progress,
            current_step=step,
            estimated_time_remaining=_eta(progress),
        )
        publish_progress(media_id, user_id, progress, step, _eta(progress))

    incremental = IncrementalPipeline(
        merger=pipeline.merger,
        translator=pipeline.translator,
        minio_client=minio_client,
        media_id=media_id,
        user_id=user_id,
        target_lang=target_lang,
        context_style=context_style,
        on_progress=_on_incremental_progress,
    )

    update_media_status(
        media_id,
        user_id=user_id,
        progress=0.15,
        current_step="PROCESSING",
        estimated_time_remaining=_eta(0.15),
    )
    publish_progress(media_id, user_id, 0.15, "PROCESSING", _eta(0.15))

    chunk_index = [0]
    source_lang_detected = [False]

    def on_chunk(batch: list, total_so_far: int):
        """Tier 1 preview chunk upload + feed into incremental merge→translate."""
        batch_data = [s.model_dump() for s in batch]
        idx = chunk_index[0]
        _chunk_key, chunk_url = minio_client.upload_chunk(media_id, idx, batch_data)
        publish_chunk_ready(
            media_id=media_id,
            user_id=user_id,
            chunk_index=idx,
            url=chunk_url,
            sentence_count=len(batch),
        )
        chunk_index[0] += 1

        # Detect source language from first chunk
        if not source_lang_detected[0] and batch:
            detected = _detect_source_language(batch)
            update_media_status(media_id, user_id=user_id, source_language=detected)
            incremental.source_lang = detected
            source_lang_detected[0] = True

        # Update transcription progress within PROCESSING range [0.15, 0.60]
        trans_frac = total_so_far / max(total_so_far + 20, 1)
        progress = min(0.60, 0.15 + trans_frac * 0.45)
        update_media_status(
            media_id,
            user_id=user_id,
            progress=progress,
            current_step="PROCESSING",
            estimated_time_remaining=_eta(progress),
        )
        publish_progress(media_id, user_id, progress, "PROCESSING", _eta(progress))
        logger.info(
            f"📤 Preview chunk {chunk_index[0]} ({len(batch)} sentences, {total_so_far} total)"
        )

        # Feed into incremental pipeline (may trigger merge+translate flush)
        incremental.feed(batch)

    sentences = pipeline.aligner.process(
        clean_audio_path,
        segments,
        profile=profile,
        on_chunk=on_chunk,
        chunk_size=CHUNK_SIZE,
    )

    # Detect language if not yet detected (very few sentences edge case)
    source_lang = incremental.source_lang
    if not source_lang and sentences:
        source_lang = _detect_source_language(sentences)
        incremental.source_lang = source_lang
        update_media_status(media_id, user_id=user_id, source_language=source_lang)
    source_lang = source_lang or "en"

    # Finalize: flush remaining buffer through merge→translate
    update_media_status(
        media_id,
        user_id=user_id,
        progress=0.90,
        current_step="FINALIZING",
        estimated_time_remaining=_eta(0.90),
    )
    publish_progress(media_id, user_id, 0.90, "FINALIZING", _eta(0.90))
    translated = incremental.finalize()

    # Generate segment-level phonetics for CJK source text
    _populate_segment_phonetics(translated, source_lang)

    # Step 5: Export
    update_media_status(
        media_id,
        user_id=user_id,
        progress=0.95,
        current_step="EXPORTING",
        estimated_time_remaining=_eta(0.95),
    )
    publish_progress(media_id, user_id, 0.95, "EXPORTING", _eta(0.95))
    model_used = (
        settings.WHISPER_MODEL_FULL
        if source_lang in settings.WHISPER_CJK_LANGUAGES
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
