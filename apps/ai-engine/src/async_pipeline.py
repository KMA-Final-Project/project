"""
V2 Async Pipeline — asyncio producer-consumer with NMT translation.

Architecture:
  - Producer: SmartAligner transcription → asyncio.Queue
  - Consumer: CJK branch (SemanticMerger) / non-CJK bypass → NMTTranslator → Tier 2 upload

The queue provides natural backpressure: if translation falls behind
transcription, the producer blocks until there is queue space.
"""

from __future__ import annotations

import asyncio
import time as _time
from pathlib import Path
from threading import Lock
from typing import Any, List

from loguru import logger

from src.config import settings
from src.core.nmt_translator import NMTTranslator
from src.core.pipeline import PipelineOrchestrator
from src.core.semantic_merger import SemanticMerger
from src.db import update_media_status
from src.events import publish_batch_ready, publish_chunk_ready, publish_progress
from src.minio_client import MinioClient
from src.schemas import (
    ContextAnalysisResult,
    Sentence,
    SubtitleMetadata,
    SubtitleOutput,
    TranslatedBatch,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Languages requiring CJK-specific processing (homophone correction + fragment merge)
# Note: _is_cjk() normalizes "zh-tw" → "zh" via split("-")[0],
# so only base codes are needed here.
_CJK_LANGUAGES: frozenset[str] = frozenset({"zh", "ja", "ko", "yue"})

# Accumulate this many chunks before running SemanticMerger for CJK
# (more context = better merge quality). Results in ~24 sentences per merge batch
# when CHUNK_SIZE=8.
CJK_MERGE_MULTIPLIER: int = 3

_PIPELINE_STAGE_ORDER: dict[str, int] = {
    "AUDIO_PREP": 0,
    "INSPECTING": 1,
    "VAD": 2,
    "PROCESSING": 3,
    "TRANSLATING": 4,
    "EXPORTING": 5,
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _is_cjk(lang: str) -> bool:
    """Return True if the language needs CJK-specific pipeline steps."""
    return lang.lower().split("-")[0] in _CJK_LANGUAGES


def _detect_source_language(sentences: list[Sentence]) -> str:
    """Detect source language from sentence content.

    Priority:
    1. detected_lang field (set by SmartAligner from Whisper's per-segment detection).
    2. CJK character heuristic.
    3. Vietnamese diacritic heuristic.
    4. Default to "en".
    """
    if not sentences:
        return "en"
    # Priority 1: use Whisper-detected language from first sentence
    if sentences[0].detected_lang:
        return sentences[0].detected_lang
    # Priority 2: character heuristics
    sample = " ".join(s.text for s in sentences[:5])
    cjk_count = sum(1 for c in sample if "\u4e00" <= c <= "\u9fff")
    if cjk_count > len(sample) * 0.3:
        return "zh"
    vn_chars = set(
        "ăâđêôơưàảãáạằẳẵắặầẩẫấậèẻẽéẹềểễếệìỉĩíịòỏõóọồổỗốộờởỡớợùủũúụừửữứựỳỷỹýỵ"
    )
    vn_count = sum(1 for c in sample.lower() if c in vn_chars)
    if vn_count > len(sample) * 0.05:
        return "vi"
    return "en"


# ---------------------------------------------------------------------------
# Main V2 pipeline
# ---------------------------------------------------------------------------


async def run_v2_pipeline_async(
    pipeline: PipelineOrchestrator,
    minio_client: MinioClient,
    audio_path: Path,
    media_id: str,
    *,
    user_id: str,
    started_at: float,
    target_lang: str = "vi",
    duration_seconds: float = 0.0,
    debug_trace: list[dict[str, Any]] | None = None,
) -> SubtitleOutput:
    """
    V2 bilingual subtitle pipeline using asyncio producer-consumer.

    Flow:
      AudioProcessor → AudioInspector → VADManager (sync, via asyncio.to_thread)
      → SmartAligner (producer, pushes chunks to queue)
      → Consumer (CJK branch / non-CJK bypass → NMTTranslator → Tier 2 upload)

    Backpressure: Queue(maxsize=4) limits how far the producer can run
    ahead of the consumer. Producer blocks when consumer is behind.
    """

    pipeline_started_at = _time.perf_counter()

    def _eta(progress: float) -> int | None:
        if progress <= 0:
            return None
        elapsed = _time.time() - started_at
        return max(0, int((elapsed / progress) - elapsed))

    def _trace(event: str, **payload: Any) -> None:
        if debug_trace is None:
            return
        entry: dict[str, Any] = {
            "event": event,
            "t": round(_time.time() - started_at, 3),
        }
        entry.update(payload)
        debug_trace.append(entry)

    progress_lock = Lock()
    progress_state: dict[str, float | str | None] = {
        "progress": 0.0,
        "step": None,
    }
    source_lang_holder: list[str] = [""]
    timing_lock = Lock()
    timing_state: dict[str, float] = {
        "producer_wait": 0.0,
        "consumer_merge": 0.0,
        "consumer_nmt": 0.0,
        "consumer_upload": 0.0,
        "consumer_idle": 0.0,
    }

    def _add_timing(metric: str, value: float) -> None:
        with timing_lock:
            timing_state[metric] = timing_state.get(metric, 0.0) + value

    def _reserve_progress(
        progress: float, current_step: str
    ) -> tuple[float, str, int | None]:
        with progress_lock:
            last_progress = float(progress_state["progress"] or 0.0)
            last_step = progress_state["step"]
            last_rank = (
                _PIPELINE_STAGE_ORDER.get(str(last_step), -1)
                if last_step is not None
                else -1
            )
            incoming_rank = _PIPELINE_STAGE_ORDER.get(current_step, last_rank)

            effective_progress = max(last_progress, progress)
            effective_step = (
                current_step if incoming_rank >= last_rank else str(last_step)
            )

            progress_state["progress"] = effective_progress
            progress_state["step"] = effective_step

            return effective_progress, effective_step, _eta(effective_progress)

    def _publish_progress(
        progress: float, current_step: str, eta: int | None
    ) -> None:
        publish_progress(
            media_id,
            user_id,
            progress,
            current_step,
            eta,
            source_lang=source_lang_holder[0] or None,
        )

    logger.info("🚀 V2 Pipeline: async NMT-based bilingual subtitle generation")
    if not settings.AI_ENABLE_LLM_REFINEMENT:
        logger.info("⏭️ AI_ENABLE_LLM_REFINEMENT disabled — using raw NMT output")

    # ── Step 1: Audio prep (sync, fast) ──────────────────────────────────
    progress, step, eta = _reserve_progress(0.05, "AUDIO_PREP")
    update_media_status(
        media_id,
        user_id=user_id,
        progress=progress,
        current_step=step,
        estimated_time_remaining=eta,
    )
    _publish_progress(progress, step, eta)
    meta = await asyncio.to_thread(pipeline.audio_processor.process, audio_path)
    standardized_path = meta.path
    _trace("audio_prep_done", standardized_path=str(standardized_path))

    # ── Step 2: Audio inspection ──────────────────────────────────────────
    progress, step, eta = _reserve_progress(0.10, "INSPECTING")
    update_media_status(
        media_id,
        user_id=user_id,
        progress=progress,
        current_step=step,
        estimated_time_remaining=eta,
    )
    _publish_progress(progress, step, eta)
    profile = await asyncio.to_thread(
        pipeline.audio_inspector.inspect, standardized_path
    )
    logger.info(f"Audio profile: {profile}")
    _trace("inspect_done", profile=profile)
    context_style = "Song/Music Lyrics" if profile == "music" else "Speech/Dialogue"

    # ── Step 3: VAD ───────────────────────────────────────────────────────
    progress, step, eta = _reserve_progress(0.15, "VAD")
    update_media_status(
        media_id,
        user_id=user_id,
        progress=progress,
        current_step=step,
        estimated_time_remaining=eta,
    )
    _publish_progress(progress, step, eta)
    segments, clean_audio_path, audio_array = await asyncio.to_thread(
        pipeline.vad_manager.process, standardized_path, profile=profile
    )
    _trace(
        "vad_done",
        segment_count=len(segments),
        clean_audio_path=str(clean_audio_path),
        audio_samples=len(audio_array),
    )
    if not segments:
        logger.warning("No speech detected — returning empty result")
        _trace("no_speech")
        update_media_status(media_id, user_id=user_id, progress=1.0, clear_step=True)
        return SubtitleOutput(
            metadata=SubtitleMetadata(
                duration=duration_seconds,
                engine_profile=settings.AI_PERF_MODE.value,
                target_lang=target_lang,
            ),
            segments=[],
        )

    # ── Step 4: Producer-consumer (Alignment + Translation) ──────────────
    #
    # QUEUE PROTOCOL:
    #   Producer puts:  list[Sentence]  (one chunk from SmartAligner)
    #   Producer puts:  None            (sentinel — signals consumer to stop)
    #   Consumer reads until it gets None.
    queue: asyncio.Queue[list[Sentence] | None] = asyncio.Queue(maxsize=4)
    loop = asyncio.get_running_loop()

    tier1_chunk_index: list[int] = [0]
    def on_chunk(batch: list[Sentence], total_so_far: int) -> None:
        """SmartAligner callback — runs in aligner's thread.

        Uploads Tier 1 (raw chunk), detects source language on first chunk,
        publishes progress, and pushes the chunk into the asyncio queue
        (blocking via run_coroutine_threadsafe to provide backpressure).
        """
        # Tier 1: upload raw chunk to MinIO
        idx = tier1_chunk_index[0]
        batch_data = [s.model_dump() for s in batch]
        _chunk_key, chunk_url = minio_client.upload_chunk(media_id, idx, batch_data)
        _trace(
            "chunk_uploaded",
            chunk_index=idx,
            sentence_count=len(batch),
            total_so_far=total_so_far,
        )
        publish_chunk_ready(
            media_id=media_id,
            user_id=user_id,
            chunk_index=idx,
            url=chunk_url,
            sentence_count=len(batch),
        )
        tier1_chunk_index[0] += 1

        # Detect source language from first chunk
        if not source_lang_holder[0] and batch:
            detected = _detect_source_language(batch)
            source_lang_holder[0] = detected
            update_media_status(media_id, user_id=user_id, source_language=detected)

        # Progress: scale 0.15-0.60 based on transcription
        trans_frac = total_so_far / max(total_so_far + 20, 1)
        progress = min(0.60, 0.15 + trans_frac * 0.45)
        progress, step, eta = _reserve_progress(progress, "PROCESSING")
        update_media_status(
            media_id,
            user_id=user_id,
            progress=progress,
            current_step=step,
            estimated_time_remaining=eta,
        )
        _publish_progress(progress, step, eta)
        logger.info(
            f"📤 V2 chunk {idx} ({len(batch)} sentences, "
            f"{total_so_far} total) | queue={queue.qsize()}/{queue.maxsize}"
        )

        # Push chunk into asyncio queue (blocks if queue is full → backpressure)
        queue_wait_started_at = _time.perf_counter()
        asyncio.run_coroutine_threadsafe(queue.put(list(batch)), loop).result()
        _add_timing("producer_wait", _time.perf_counter() - queue_wait_started_at)

    async def producer() -> None:
        """Run SmartAligner in a thread and send sentinel when done."""
        try:
            await asyncio.to_thread(
                pipeline.aligner.process,
                clean_audio_path,
                segments,
                profile=profile,
                on_chunk=on_chunk,
                chunk_size=settings.CHUNK_SIZE,
                audio_array=audio_array,
            )
        finally:
            await queue.put(None)  # sentinel

    async def consumer() -> list[Sentence]:
        """Consume chunks from queue: CJK branch / non-CJK → NMT → Tier 2 upload."""
        consumer_started_at = _time.perf_counter()
        nmt = await nmt_prefetch_task
        merger = pipeline.merger
        llm = pipeline.llm

        all_sentences: list[Sentence] = []
        cjk_buffer: list[Sentence] = []
        batch_index: int = 0
        chunks_since_cjk_flush: int = 0
        context_result: ContextAnalysisResult | None = None
        context_analyzed: bool = False
        upload_semaphore = asyncio.Semaphore(2)
        upload_tasks: list[asyncio.Task[None]] = []

        def _source_lang() -> str:
            return source_lang_holder[0] or "en"

        def _flush_cjk_buffer() -> list[Sentence]:
            """Run SemanticMerger on accumulated CJK sentences and return flat list."""
            nonlocal cjk_buffer
            if not cjk_buffer:
                return []
            src = _source_lang()
            buf = list(cjk_buffer)
            cjk_buffer = []

            t0 = _time.time()
            if len(buf) > 3 and merger.needs_merge(buf, src):
                merged_groups: List[List[Sentence]] = merger.process(
                    buf,
                    source_lang=src,
                    context_style=context_style,
                )
                result = [sent for group in merged_groups for sent in group]
                logger.info(
                    f"🔀 CJK merge: {len(buf)} → {len(result)} segments "
                    f"in {_time.time() - t0:.2f}s"
                )
                return result

            logger.info(
                f"⏭️ CJK passthrough: {len(buf)} segments in {_time.time() - t0:.2f}s"
            )
            return list(buf)

        def _translate_batch(
            sentences: list[Sentence],
        ) -> tuple[list[Sentence], int, str, str, float]:
            """Translate via NMT and optional LLM refinement."""
            nonlocal context_result, context_analyzed
            if not sentences:
                return [], 0, "en", target_lang, _time.perf_counter()

            batch_started_at = _time.perf_counter()
            batch_start_index: int = len(all_sentences)

            src = _source_lang()
            tgt = target_lang
            texts = [s.text for s in sentences]

            nmt_started_at = _time.perf_counter()
            if src == tgt:
                nmt_translations = list(texts)
                logger.debug(
                    f"⏭️ NMT skipped (source == target): {len(sentences)} segments"
                )
            else:
                nmt_translations = nmt.translate_batch(texts, src, tgt)
                logger.info(
                    f"🌐 NMT batch {batch_index}: {len(sentences)} segments "
                    f"{src}→{tgt} in {_time.perf_counter() - nmt_started_at:.2f}s"
                )
            _add_timing("consumer_nmt", _time.perf_counter() - nmt_started_at)

            if (
                settings.AI_ENABLE_LLM_REFINEMENT
                and not context_analyzed
                and src != tgt
            ):
                context_analyzed = True
                try:
                    sample = texts[:10]
                    ctx = llm.analyze_context(sample, tgt)
                    context_result = ctx
                    logger.info(
                        f"📊 Context analysis: style={ctx.detected_style}, "
                        f"pronouns={ctx.detected_pronouns}"
                    )
                except Exception as e:
                    logger.warning(f"Context analysis failed (continuing without): {e}")
                    context_result = None

            final_translations = nmt_translations
            if (
                settings.AI_ENABLE_LLM_REFINEMENT
                and context_result is not None
                and src != tgt
            ):
                try:
                    t1 = _time.time()
                    refined = llm.refine_batch(
                        texts, nmt_translations, context_result, tgt
                    )
                    if refined is not None:
                        final_translations = refined
                        logger.info(
                            f"✨ LLM refinement batch {batch_index}: "
                            f"{len(sentences)} segments in {_time.time() - t1:.2f}s"
                        )
                    else:
                        logger.debug(
                            f"⏭️ Refinement returned None for batch {batch_index} "
                            f"— using NMT output"
                        )
                except Exception as e:
                    logger.warning(
                        f"Refinement failed for batch {batch_index} — using NMT: {e}"
                    )

            # Apply translations to sentences
            for s, t in zip(sentences, final_translations):
                s.translation = t

            for i, s in enumerate(sentences):
                s.segment_index = batch_start_index + i

            return sentences, batch_start_index, src, tgt, batch_started_at

        async def _upload_batch(
            current_batch_index: int,
            batch_start_index: int,
            sentences: list[Sentence],
            src: str,
            tgt: str,
            batch_started_at: float,
        ) -> None:
            async with upload_semaphore:
                upload_started_at = _time.perf_counter()
                tb = TranslatedBatch(
                    batch_index=current_batch_index,
                    first_segment_index=batch_start_index,
                    segments=sentences,
                )
                _batch_key, batch_url = await asyncio.to_thread(
                    minio_client.upload_translated_batch, media_id, tb
                )
                upload_elapsed = _time.perf_counter() - upload_started_at
                _add_timing("consumer_upload", upload_elapsed)

                _trace(
                    "batch_uploaded",
                    batch_index=current_batch_index,
                    segment_count=len(sentences),
                    source_lang=src,
                    target_lang=tgt,
                )

                total_so_far = batch_start_index + len(sentences)
                progress = min(
                    0.90, 0.60 + (total_so_far / max(total_so_far + 30, 1)) * 0.30
                )
                progress, step, eta = _reserve_progress(progress, "TRANSLATING")
                publish_batch_ready(
                    media_id=media_id,
                    user_id=user_id,
                    batch_index=current_batch_index,
                    url=batch_url,
                    segment_count=len(sentences),
                    progress=progress,
                )
                update_media_status(
                    media_id,
                    user_id=user_id,
                    progress=progress,
                    current_step=step,
                    estimated_time_remaining=eta,
                )
                _publish_progress(progress, step, eta)

                logger.info(
                    f"📝 Tier 2 batch {current_batch_index}: {len(sentences)} segments uploaded "
                    f"(upload={upload_elapsed:.2f}s, total={_time.perf_counter() - batch_started_at:.2f}s)"
                )

        async def _schedule_translated_batch(sentences: list[Sentence]) -> list[Sentence]:
            nonlocal batch_index, upload_tasks
            if not sentences:
                return []

            translated, batch_start_index, src, tgt, batch_started_at = await asyncio.to_thread(
                _translate_batch,
                sentences,
            )
            if not translated:
                return []

            current_batch_index = batch_index
            batch_index += 1
            all_sentences.extend(translated)
            upload_tasks.append(
                asyncio.create_task(
                    _upload_batch(
                        current_batch_index,
                        batch_start_index,
                        translated,
                        src,
                        tgt,
                        batch_started_at,
                    )
                )
            )

            done_tasks = [task for task in upload_tasks if task.done()]
            for task in done_tasks:
                await task
            upload_tasks = [task for task in upload_tasks if not task.done()]
            return translated

        while True:
            queue_wait_started_at = _time.perf_counter()
            chunk = await queue.get()
            _add_timing("consumer_idle", _time.perf_counter() - queue_wait_started_at)
            if chunk is None:
                # Sentinel received — flush remaining CJK buffer
                if cjk_buffer:
                    _trace(
                        "batch_processing_started",
                        batch_index=batch_index,
                        buffered_sentences=len(cjk_buffer),
                        path="cjk_final_flush",
                    )
                    merge_started_at = _time.perf_counter()
                    flushed = await asyncio.to_thread(_flush_cjk_buffer)
                    _add_timing(
                        "consumer_merge", _time.perf_counter() - merge_started_at
                    )
                    await _schedule_translated_batch(flushed)
                if upload_tasks:
                    await asyncio.gather(*upload_tasks)
                break

            is_cjk_content = _is_cjk(_source_lang())

            if is_cjk_content:
                cjk_buffer.extend(chunk)
                chunks_since_cjk_flush += 1

                # Speed-first rule: flush the first CJK batch as soon as the first
                # viable chunk exists, then return to the larger merge window for
                # later batches.
                should_flush = False
                if batch_index == 0 and chunks_since_cjk_flush >= 1:
                    should_flush = True
                elif chunks_since_cjk_flush >= CJK_MERGE_MULTIPLIER:
                    should_flush = True

                if should_flush:
                    _trace(
                        "batch_processing_started",
                        batch_index=batch_index,
                        buffered_sentences=len(cjk_buffer),
                        path="cjk",
                    )
                    merge_started_at = _time.perf_counter()
                    flushed = await asyncio.to_thread(_flush_cjk_buffer)
                    _add_timing(
                        "consumer_merge", _time.perf_counter() - merge_started_at
                    )
                    await _schedule_translated_batch(flushed)
                    chunks_since_cjk_flush = 0
            else:
                # Non-CJK: translate directly (no merge needed)
                _trace(
                    "batch_processing_started",
                    batch_index=batch_index,
                    buffered_sentences=len(chunk),
                    path="non_cjk",
                )
                await _schedule_translated_batch(list(chunk))

        consumer_total = _time.perf_counter() - consumer_started_at
        logger.info(
            "⏱️ Consumer: "
            f"merge={timing_state['consumer_merge']:.3f}s, "
            f"nmt={timing_state['consumer_nmt']:.3f}s, "
            f"upload={timing_state['consumer_upload']:.3f}s, "
            f"idle={timing_state['consumer_idle']:.3f}s, "
            f"total={consumer_total:.3f}s"
        )

        return all_sentences

    # ── Run producer and consumer concurrently ────────────────────────────
    progress, step, eta = _reserve_progress(0.15, "PROCESSING")
    update_media_status(
        media_id,
        user_id=user_id,
        progress=progress,
        current_step=step,
        estimated_time_remaining=eta,
    )
    _publish_progress(progress, step, eta)

    producer_task = asyncio.create_task(producer())
    nmt_prefetch_task = asyncio.create_task(
        asyncio.to_thread(NMTTranslator.get_instance)
    )
    consumer_task = asyncio.create_task(consumer())

    try:
        await producer_task
        all_sentences = await consumer_task
    except Exception:
        producer_task.cancel()
        consumer_task.cancel()
        nmt_prefetch_task.cancel()
        raise

    # ── Step 5: Final metadata + export ──────────────────────────────────
    detected_source_lang = (
        _detect_source_language(all_sentences) if all_sentences else "en"
    )
    model_used = (
        settings.WHISPER_MODEL_FULL
        if detected_source_lang in settings.WHISPER_CJK_LANGUAGES
        else settings.WHISPER_MODEL_TURBO
    )
    source_lang_holder[0] = detected_source_lang

    progress, step, eta = _reserve_progress(0.98, "EXPORTING")
    update_media_status(
        media_id,
        user_id=user_id,
        progress=progress,
        current_step=step,
        estimated_time_remaining=eta,
    )
    _publish_progress(progress, step, eta)

    logger.success(
        f"✅ V2 Pipeline complete: {len(all_sentences)} bilingual segments | "
        f"source={detected_source_lang} target={target_lang}"
    )
    pipeline_total = _time.perf_counter() - pipeline_started_at
    pipeline.last_run_metrics = {
        "smart_aligner": dict(getattr(pipeline.aligner, "last_timing", {})),
        "consumer": {
            "merge": round(timing_state["consumer_merge"], 3),
            "nmt": round(timing_state["consumer_nmt"], 3),
            "upload": round(timing_state["consumer_upload"], 3),
            "idle": round(timing_state["consumer_idle"], 3),
        },
        "producer_wait": round(timing_state["producer_wait"], 3),
        "pipeline_total": round(pipeline_total, 3),
    }
    logger.info(
        "⏱️ Pipeline: "
        f"producer_wait={timing_state['producer_wait']:.3f}s, "
        f"total={pipeline_total:.3f}s"
    )
    _trace(
        "pipeline_completed",
        segment_count=len(all_sentences),
        source_lang=detected_source_lang,
        target_lang=target_lang,
    )

    return SubtitleOutput(
        metadata=SubtitleMetadata(
            duration=duration_seconds,
            engine_profile=settings.AI_PERF_MODE.value,
            source_lang=detected_source_lang,
            target_lang=target_lang,
            model_used=model_used,
        ),
        segments=all_sentences,
    )
