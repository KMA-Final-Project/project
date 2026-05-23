"""
V2 Async Pipeline — asyncio producer-consumer with NMT translation.

Architecture:
  - Producer: SmartAligner transcription → asyncio.Queue
    - Consumer: semantic batching (CJK + non-CJK) → NMTTranslator → Tier 2 upload

The queue provides natural backpressure when translation overlaps with ASR.
In the hybrid `after_asr` mode the queue stays unbounded so Tier 1 chunk
streaming can continue while translation is deferred until ASR releases the GPU.
"""

from __future__ import annotations

import asyncio
import time as _time
from pathlib import Path
from threading import Lock
from types import SimpleNamespace
from typing import Any, List

from loguru import logger

from src.config import settings
from src.core.chinese_batch_llm_translator import (
    ChineseBatchLLMResult,
    ChineseBatchLLMTranslator,
)
from src.core.chinese_candidate_normalizer import (
    ChineseCandidateNormalizeResult,
    normalize_chinese_candidate_sentences,
)
from src.core.chinese_phonetics import apply_chinese_pinyin
from src.core.chinese_primary_refiner import (
    ChinesePrimaryRefineResult,
    refine_chinese_primary_transcript,
)
from src.core.chinese_window_profiler import profile_chinese_transcript_windows
from src.core.chinese_window_repairer import (
    CandidateSnapshot,
    ChineseWindowRepairResult,
    repair_chinese_candidate_windows,
)
from src.core.chinese_prior import ChineseRoutePrior, build_chinese_route_prior
from src.core.nmt_translator import NMTTranslator
from src.core.pipeline import PipelineOrchestrator
from src.core.semantic_merger import OVERLAP_LINES, SemanticMerger
from src.core.transcript_trust_gate import (
    ChineseTrustGateError,
    ChineseTranscriptTrustGate,
    TranscriptTrustDecision,
)
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
NON_CJK_LOOKAHEAD_LINES: int = OVERLAP_LINES

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


def _batch_sentences(sentences: list[Sentence], chunk_size: int) -> list[list[Sentence]]:
    size = max(1, chunk_size)
    return [
        list(sentences[index : index + size])
        for index in range(0, len(sentences), size)
    ]


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
    prefetch_nmt: bool | None = None,
    source_language_hint: str | None = None,
    media_context: dict[str, str] | None = None,
) -> SubtitleOutput:
    """
    V2 bilingual subtitle pipeline using asyncio producer-consumer.

    Flow:
      AudioProcessor → AudioInspector → VADManager (sync, via asyncio.to_thread)
      → source-language decision
      → SmartAligner (producer, pushes chunks to queue)
      → Consumer (semantic batching → NMTTranslator → Tier 2 upload)

    Backpressure: when translation overlaps with ASR, Queue(maxsize=4) limits how
    far the producer can run ahead of the consumer. In `after_asr` mode the queue
    is unbounded and drains only after the ASR stage completes.
    """

    pipeline_started_at = _time.perf_counter()
    translation_start_policy = settings.translation_start_policy
    nmt_prefetch_enabled = (
        settings.nmt_prefetch_enabled if prefetch_nmt is None else bool(prefetch_nmt)
    )

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
        "consumer_llm": 0.0,
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

    def _publish_progress(progress: float, current_step: str, eta: int | None) -> None:
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

    configured_source_hint = settings.source_language_hint
    local_source_hint = settings.normalize_language_tag(source_language_hint)
    selected_source_lang = ""
    probe_source_lang = ""
    routing_strategy = "fallback"
    probe_details: dict[str, Any] = {}
    chinese_prior = ChineseRoutePrior(0.0, "", "none", ())
    trust_gate = ChineseTranscriptTrustGate()
    trust_gate_active = False
    trust_decision: TranscriptTrustDecision | None = None
    trust_stage = "normal"
    trust_attempts: list[dict[str, Any]] = []
    trusted_candidate_batches: list[list[Sentence]] | None = None
    chinese_normalize_result = ChineseCandidateNormalizeResult([], [])
    chinese_refine_result = ChinesePrimaryRefineResult([], [], [], [], [])
    chinese_repair_result = ChineseWindowRepairResult([], [])
    skip_cjk_semantic_merge = False
    chinese_llm_metrics: list[dict[str, Any]] = []

    if configured_source_hint:
        selected_source_lang = configured_source_hint
        routing_strategy = "config_hint"
    elif local_source_hint:
        selected_source_lang = local_source_hint
        routing_strategy = "local_hint"
    elif settings.AI_SOURCE_LANGUAGE_PROBE_ENABLED:
        probe_source_lang = (
            await asyncio.to_thread(
                pipeline.aligner.probe_source_language,
                clean_audio_path,
                segments,
                audio_array=audio_array,
                max_segments=settings.AI_SOURCE_LANGUAGE_PROBE_MAX_SEGMENTS,
                max_seconds=settings.AI_SOURCE_LANGUAGE_PROBE_MAX_SECONDS,
            )
            or ""
        )
        if probe_source_lang:
            selected_source_lang = probe_source_lang
            routing_strategy = "probe"
        probe_details = dict(getattr(pipeline.aligner, "last_probe_details", {}))

    chinese_prior = build_chinese_route_prior(
        media_context=media_context,
        local_audio_path=clean_audio_path,
        probe_source_lang=probe_source_lang,
        probe_details=probe_details,
    )
    if (
        chinese_prior.should_bias_route
        and selected_source_lang in {"", "en"}
        and chinese_prior.suspected_family
    ):
        selected_source_lang = chinese_prior.suspected_family
        routing_strategy = "chinese_prior"

    route_override_zh = None
    if local_source_hint and local_source_hint.startswith("zh"):
        route_override_zh = "sensevoice_small"

    if hasattr(pipeline.aligner, "route_decision_for_language"):
        route_decision = pipeline.aligner.route_decision_for_language(
            selected_source_lang or None,
            requested_policy=translation_start_policy,
            route_override=route_override_zh,
        )
    else:
        legacy_route = pipeline.aligner.resolve_route(
            route_override_zh or pipeline.aligner.route_for_language(selected_source_lang or None)
        )
        legacy_model_name = (
            settings.WHISPER_MODEL_FULL
            if legacy_route in {"full", "whisper_full"}
            else settings.WHISPER_MODEL_TURBO
        )
        route_decision = SimpleNamespace(
            route_id=legacy_route,
            provider_id="whisper",
            model_id=legacy_model_name,
            effective_policy=translation_start_policy,
            auto_downgraded=False,
            fallback_chain=(legacy_route,),
        )
    selected_route = route_decision.route_id
    selected_model_name = route_decision.model_id
    selected_provider_id = route_decision.provider_id
    effective_translation_policy = route_decision.effective_policy
    auto_policy_downgraded = route_decision.auto_downgraded
    trust_gate_active = settings.AI_CHINESE_TRUST_GATE_ENABLED and (
        chinese_prior.should_gate
        or selected_source_lang in {"zh", "yue"}
        or probe_source_lang in {"zh", "yue"}
    )
    if trust_gate_active and settings.AI_CHINESE_FORCE_AFTER_ASR_ON_RECOVERY:
        effective_translation_policy = "after_asr"
        auto_policy_downgraded = True
    probe_cleanup_route = (
        "whisper_turbo"
        if hasattr(pipeline.aligner, "route_decision_for_language")
        else "turbo"
    )
    if effective_translation_policy == "after_asr":
        nmt_prefetch_enabled = False
        await asyncio.to_thread(NMTTranslator.unload_instance)

    if selected_source_lang:
        source_lang_holder[0] = selected_source_lang
        update_media_status(
            media_id,
            user_id=user_id,
            source_language=selected_source_lang,
        )

    if (
        effective_translation_policy == "after_asr"
        and probe_source_lang
        and selected_route not in {"turbo", "whisper_turbo"}
    ):
        await asyncio.to_thread(pipeline.aligner.unload_route, probe_cleanup_route)

    logger.info(
        f"🧭 Source routing: strategy={routing_strategy} "
        f"source={selected_source_lang or 'unknown'} route={selected_route} "
        f"provider={selected_provider_id} policy={translation_start_policy} "
        f"effective_policy={effective_translation_policy} "
        f"chinese_prior_score={chinese_prior.prior_score:.2f} "
        f"trust_gate_active={trust_gate_active}"
    )
    _trace(
        "source_routing_decided",
        strategy=routing_strategy,
        source_lang=selected_source_lang or "",
        probe_source_lang=probe_source_lang,
        probe_scores=probe_details.get("scores", {}),
        chinese_prior_score=chinese_prior.prior_score,
        chinese_prior_sources=list(chinese_prior.sources),
        route=selected_route,
        provider=selected_provider_id,
        requested_translation_start_policy=translation_start_policy,
        translation_start_policy=effective_translation_policy,
        auto_policy_downgraded=auto_policy_downgraded,
        fallback_chain=list(route_decision.fallback_chain),
        trust_gate_active=trust_gate_active,
    )

    # ── Step 4: Producer-consumer (Alignment + Translation) ──────────────
    #
    # QUEUE PROTOCOL:
    #   Producer puts:  list[Sentence]  (one chunk from SmartAligner)
    #   Producer puts:  None            (sentinel — signals consumer to stop)
    #   Consumer reads until it gets None.
    queue_maxsize = 0 if effective_translation_policy == "after_asr" else 4
    queue: asyncio.Queue[list[Sentence] | None] = asyncio.Queue(maxsize=queue_maxsize)
    loop = asyncio.get_running_loop()

    tier1_chunk_index: list[int] = [0]

    def _publish_chunk_side_effects(batch: list[Sentence], total_so_far: int) -> None:
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
            f"{total_so_far} total) | queue={queue.qsize()}/"
            f"{'unbounded' if queue.maxsize == 0 else queue.maxsize}"
        )

    def on_chunk(batch: list[Sentence], total_so_far: int) -> None:
        """SmartAligner callback — runs in aligner's thread."""
        _publish_chunk_side_effects(batch, total_so_far)

        # Push chunk into asyncio queue (blocks if queue is full → backpressure)
        queue_wait_started_at = _time.perf_counter()
        asyncio.run_coroutine_threadsafe(queue.put(list(batch)), loop).result()
        _add_timing("producer_wait", _time.perf_counter() - queue_wait_started_at)

    async def _replay_chunk(batch: list[Sentence], total_so_far: int) -> None:
        _publish_chunk_side_effects(batch, total_so_far)
        await queue.put(list(batch))

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
                source_language=selected_source_lang or None,
                route_override=selected_route,
            )
        finally:
            await queue.put(None)  # sentinel

    async def _run_candidate_asr(
        candidate_route: str,
        *,
        candidate_source_lang: str | None,
    ) -> tuple[list[Sentence], list[list[Sentence]], dict[str, Any]]:
        candidate_batches: list[list[Sentence]] = []

        def _collect_only(batch: list[Sentence], total_so_far: int) -> None:
            del total_so_far
            candidate_batches.append(list(batch))

        candidate_sentences = await asyncio.to_thread(
            pipeline.aligner.process,
            clean_audio_path,
            segments,
            profile=profile,
            on_chunk=_collect_only,
            chunk_size=settings.CHUNK_SIZE,
            audio_array=audio_array,
            source_language=candidate_source_lang,
            route_override=candidate_route,
        )
        usage = dict(getattr(pipeline.aligner, "last_route_usage", {}))
        return candidate_sentences, candidate_batches, usage

    async def consumer() -> list[Sentence]:
        """Consume chunks from queue: CJK branch / non-CJK → NMT → Tier 2 upload."""
        consumer_started_at = _time.perf_counter()
        nmt: NMTTranslator | None = (
            await nmt_prefetch_task if nmt_prefetch_task is not None else None
        )
        merger = pipeline.merger
        llm = pipeline.llm
        chinese_llm_translator = ChineseBatchLLMTranslator(llm)

        all_sentences: list[Sentence] = []
        cjk_buffer: list[Sentence] = []
        non_cjk_buffer: list[Sentence] = []
        batch_index: int = 0
        chunks_since_cjk_flush: int = 0
        context_result: ContextAnalysisResult | None = None
        context_analyzed: bool = False
        upload_semaphore = asyncio.Semaphore(2)
        upload_tasks: list[asyncio.Task[None]] = []
        pending_cjk_translation_batch: list[Sentence] | None = None

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
            if skip_cjk_semantic_merge:
                logger.info(
                    f"⏭️ CJK pre-segmented passthrough: {len(buf)} segments in {_time.time() - t0:.2f}s"
                )
                return list(buf)
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

        def _flush_non_cjk_buffer(final: bool = False) -> list[Sentence]:
            """Commit the safe semantic prefix for non-CJK streaming windows."""
            nonlocal non_cjk_buffer
            if not non_cjk_buffer:
                return []

            core_size = len(non_cjk_buffer)
            if not final:
                core_size = max(0, len(non_cjk_buffer) - NON_CJK_LOOKAHEAD_LINES)
            if core_size <= 0:
                return []

            src = _source_lang()
            buf = list(non_cjk_buffer)
            emitted, retain_from = merger.process_stream_window(
                buf,
                source_lang=src,
                context_style=context_style,
                core_size=core_size,
            )

            if final:
                non_cjk_buffer = []
            else:
                non_cjk_buffer = buf[retain_from:]

            logger.info(
                f"🔀 Non-CJK semantic window: buffered={len(buf)} core={core_size} "
                f"emitted={len(emitted)} retained={len(non_cjk_buffer)}"
            )
            return emitted

        def _translate_batch(
            sentences: list[Sentence],
            *,
            context_before: list[Sentence] | None = None,
            context_after: list[Sentence] | None = None,
        ) -> tuple[list[Sentence], int, str, str, float]:
            """Translate via NMT and optional LLM refinement."""
            nonlocal context_result, context_analyzed, nmt
            if not sentences:
                return [], 0, "en", target_lang, _time.perf_counter()

            batch_started_at = _time.perf_counter()
            batch_start_index: int = len(all_sentences)

            src = _source_lang()
            tgt = target_lang
            texts = [s.text for s in sentences]
            llm_rescue_result = ChineseBatchLLMResult((), ())
            nmt_time_spent = 0.0

            def _translate_with_nmt(batch_texts: list[str]) -> list[str]:
                nonlocal nmt, nmt_time_spent
                nmt_call_started_at = _time.perf_counter()
                if nmt is None:
                    nmt = NMTTranslator.get_instance()
                result = nmt.translate_batch(batch_texts, src, tgt)
                nmt_time_spent += _time.perf_counter() - nmt_call_started_at
                return result

            if src == tgt:
                nmt_translations = list(texts)
                logger.debug(
                    f"⏭️ NMT skipped (source == target): {len(sentences)} segments"
                )
            elif src in {"zh", "yue"} and settings.AI_CHINESE_LLM_RESCUE_ENABLED:
                llm_started_at = _time.perf_counter()
                llm_rescue_result = chinese_llm_translator.translate_batch(
                    sentences,
                    target_lang=tgt,
                    fallback_translate=_translate_with_nmt,
                    context_before=context_before,
                    context_after=context_after,
                    source_lang=src,
                    actual_route=str(route_usage.get("actual_route") or selected_route),
                )
                _add_timing("consumer_llm", _time.perf_counter() - llm_started_at)
                chinese_llm_metrics.append(llm_rescue_result.as_metrics())
                llm_batches_used = llm_rescue_result.as_metrics()["llm_batches_used"]
                fallback_batches = llm_rescue_result.as_metrics()["fallback_batches"]
                nmt_translations = [sentence.translation for sentence in llm_rescue_result.sentences]
                sentences = [sentence.model_copy(deep=True) for sentence in llm_rescue_result.sentences]
                logger.info(
                    f"🈶 Chinese batch translation {batch_index}: {len(sentences)} segments "
                    f"(llm_batches={llm_batches_used}, llm_fallbacks={fallback_batches})"
                )
            else:
                nmt_started_at = _time.perf_counter()
                nmt_translations = _translate_with_nmt(texts)
                logger.info(
                    f"🌐 NMT batch {batch_index}: {len(sentences)} segments "
                    f"{src}→{tgt} in {_time.perf_counter() - nmt_started_at:.2f}s"
                )
            _add_timing("consumer_nmt", nmt_time_spent)

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
                and src not in {"zh", "yue"}
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

        async def _schedule_translated_batch(
            sentences: list[Sentence],
            *,
            context_before: list[Sentence] | None = None,
            context_after: list[Sentence] | None = None,
        ) -> list[Sentence]:
            nonlocal batch_index, upload_tasks
            if not sentences:
                return []

            translated, batch_start_index, src, tgt, batch_started_at = (
                await asyncio.to_thread(
                    _translate_batch,
                    sentences,
                    context_before=context_before,
                    context_after=context_after,
                )
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

        def _zh_llm_rescue_active() -> bool:
            return (
                settings.AI_CHINESE_LLM_RESCUE_ENABLED
                and _source_lang() in {"zh", "yue"}
            )

        async def _schedule_with_context(
            sentences: list[Sentence],
            *,
            final: bool = False,
        ) -> None:
            nonlocal pending_cjk_translation_batch
            if not sentences and not final:
                return
            if not _zh_llm_rescue_active():
                if sentences:
                    await _schedule_translated_batch(sentences)
                return

            shadow = max(0, settings.AI_CHINESE_LLM_RESCUE_SHADOW_SEGMENTS)
            if pending_cjk_translation_batch is None:
                if final:
                    if sentences:
                        await _schedule_translated_batch(
                            sentences,
                            context_before=all_sentences[-shadow:] if shadow else None,
                            context_after=[],
                        )
                    return
                pending_cjk_translation_batch = list(sentences)
                return

            if sentences:
                await _schedule_translated_batch(
                    pending_cjk_translation_batch,
                    context_before=all_sentences[-shadow:] if shadow else None,
                    context_after=list(sentences[:shadow]) if shadow else None,
                )
                if final:
                    await _schedule_translated_batch(
                        sentences,
                        context_before=all_sentences[-shadow:] if shadow else None,
                        context_after=[],
                    )
                    pending_cjk_translation_batch = None
                else:
                    pending_cjk_translation_batch = list(sentences)
                return

            await _schedule_translated_batch(
                pending_cjk_translation_batch,
                context_before=all_sentences[-shadow:] if shadow else None,
                context_after=[],
            )
            pending_cjk_translation_batch = None

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
                    await _schedule_with_context(flushed, final=True)
                elif pending_cjk_translation_batch is not None:
                    await _schedule_with_context([], final=True)
                if non_cjk_buffer:
                    _trace(
                        "batch_processing_started",
                        batch_index=batch_index,
                        buffered_sentences=len(non_cjk_buffer),
                        path="non_cjk_final_flush",
                    )
                    merge_started_at = _time.perf_counter()
                    flushed = await asyncio.to_thread(_flush_non_cjk_buffer, True)
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
                    await _schedule_with_context(flushed)
                    chunks_since_cjk_flush = 0
            else:
                non_cjk_buffer.extend(chunk)
                _trace(
                    "batch_processing_started",
                    batch_index=batch_index,
                    buffered_sentences=len(non_cjk_buffer),
                    path="non_cjk_semantic",
                )
                merge_started_at = _time.perf_counter()
                flushed = await asyncio.to_thread(_flush_non_cjk_buffer, False)
                _add_timing("consumer_merge", _time.perf_counter() - merge_started_at)
                await _schedule_translated_batch(flushed)

        consumer_total = _time.perf_counter() - consumer_started_at
        logger.info(
            "⏱️ Consumer: "
            f"merge={timing_state['consumer_merge']:.3f}s, "
            f"nmt={timing_state['consumer_nmt']:.3f}s, "
            f"llm={timing_state['consumer_llm']:.3f}s, "
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

    nmt_prefetch_task = (
        asyncio.create_task(asyncio.to_thread(NMTTranslator.get_instance))
        if nmt_prefetch_enabled and not trust_gate_active
        else None
    )
    all_sentences: list[Sentence]
    route_usage: dict[str, Any] = {}

    if trust_gate_active:
        trust_candidate_routes: list[str] = [selected_route]
        for recovery_route in settings.chinese_recovery_route_ids:
            resolved_recovery_route = pipeline.aligner.resolve_route(recovery_route)
            if resolved_recovery_route not in trust_candidate_routes:
                trust_candidate_routes.append(resolved_recovery_route)

        trusted_candidate_sentences: list[Sentence] | None = None
        trusted_candidate_batches = None
        candidate_history: list[CandidateSnapshot] = []
        ownership_candidate_sentences: list[Sentence] | None = None
        ownership_candidate_usage: dict[str, Any] = {}
        ownership_candidate_stage = trust_stage

        for route_index, candidate_route in enumerate(trust_candidate_routes):
            if route_index == 0:
                trust_stage = "first_pass"
            else:
                stage_prefix = settings.normalize_route_id(candidate_route) or "recovery"
                trust_stage = (
                    "final_recovery"
                    if route_index == len(trust_candidate_routes) - 1
                    else f"{stage_prefix}_recovery"
                )

            candidate_sentences, candidate_batches, candidate_usage = await _run_candidate_asr(
                candidate_route,
                candidate_source_lang=selected_source_lang or None,
            )
            normalize_result = normalize_chinese_candidate_sentences(candidate_sentences)
            candidate_windows = profile_chinese_transcript_windows(normalize_result.sentences)
            candidate_history.append(
                CandidateSnapshot(
                    route=str(candidate_usage.get("actual_route") or candidate_route),
                    provider=str(candidate_usage.get("provider_id") or ""),
                    sentences=[
                        sentence.model_copy(deep=True)
                        for sentence in normalize_result.sentences
                    ],
                )
            )
            candidate_diagnostics = dict(candidate_usage.get("diagnostics", {}))
            candidate_decision = trust_gate.evaluate(
                prior=chinese_prior,
                sentences=normalize_result.sentences,
                route_id=str(candidate_usage.get("actual_route") or candidate_route),
                diagnostics=candidate_diagnostics,
                probe_details=probe_details,
                stage=trust_stage,
                duration_seconds=duration_seconds,
                windows=candidate_windows,
            )
            trust_attempts.append(
                {
                    "stage": trust_stage,
                    "route": candidate_usage.get("actual_route") or candidate_route,
                    "provider": candidate_usage.get("provider_id") or "",
                    "normalize": normalize_result.as_metrics(),
                    "decision": candidate_decision.as_metrics(),
                }
            )
            _trace(
                "trust_gate_evaluated",
                stage=trust_stage,
                route=candidate_usage.get("actual_route") or candidate_route,
                decision=candidate_decision.verdict,
                owner_score=candidate_decision.owner_score,
                cleanliness_score=candidate_decision.cleanliness_score,
                suspicious_score=candidate_decision.suspicious_score,
                reasons=list(candidate_decision.reasons),
            )
            if candidate_decision.ownership_trusted and ownership_candidate_sentences is None:
                ownership_candidate_sentences = [
                    sentence.model_copy(deep=True) for sentence in normalize_result.sentences
                ]
                ownership_candidate_usage = dict(candidate_usage)
                trust_decision = candidate_decision
                trusted_candidate_batches = candidate_batches or _batch_sentences(
                    normalize_result.sentences, settings.CHUNK_SIZE
                )
                ownership_candidate_stage = trust_stage
                chinese_normalize_result = normalize_result
                selected_route = str(candidate_usage.get("actual_route") or candidate_route)
                selected_provider_id = str(candidate_usage.get("provider_id") or selected_provider_id)
                selected_model_name = str(candidate_usage.get("model_id") or selected_model_name)

            if candidate_decision.publish_ready:
                trust_decision = candidate_decision
                trusted_candidate_sentences = [
                    sentence.model_copy(deep=True) for sentence in normalize_result.sentences
                ]
                route_usage = dict(candidate_usage)
                break

            await asyncio.to_thread(pipeline.aligner.unload_all)

            if candidate_decision.verdict == "untrusted_fail":
                trust_decision = candidate_decision
                break

        if trusted_candidate_sentences is None and ownership_candidate_sentences is not None:
            trusted_candidate_sentences = [
                sentence.model_copy(deep=True) for sentence in ownership_candidate_sentences
            ]
            route_usage = dict(ownership_candidate_usage)
            trust_stage = ownership_candidate_stage
            alternate_candidates = [
                snapshot
                for snapshot in candidate_history
                if snapshot.route != selected_route and snapshot.sentences
            ]
            if trust_decision and trust_decision.repair_window_indexes and alternate_candidates:
                chinese_repair_result = repair_chinese_candidate_windows(
                    trusted_candidate_sentences,
                    alternate_candidates,
                    list(trust_decision.repair_window_indexes),
                )
                trusted_candidate_sentences = chinese_repair_result.sentences

        if trusted_candidate_sentences is None:
            trust_decision = trust_decision or TranscriptTrustDecision(
                verdict="untrusted_fail",
                owner_score=settings.AI_CHINESE_TRUST_OWNER_SUSPICIOUS_SCORE,
                cleanliness_score=settings.AI_CHINESE_TRUST_REPAIR_SCORE,
                suspicious_score=settings.AI_CHINESE_TRUST_FAIL_SCORE,
                reasons=("recovery_exhausted",),
                owner_reasons=("recovery_exhausted",),
                cleanliness_reasons=(),
                force_after_asr=True,
                publication_blocked=True,
                publish_ready=False,
                ownership_trusted=False,
                repair_window_indexes=(),
                signals=trust_gate.evaluate(
                    prior=chinese_prior,
                    sentences=[],
                    route_id=selected_route,
                    diagnostics={},
                    probe_details=probe_details,
                    stage="final_recovery",
                    duration_seconds=duration_seconds,
                    windows=[],
                ).signals,
                window_metrics=(),
            )
            if settings.AI_CHINESE_FAIL_CLOSED:
                raise ChineseTrustGateError(
                    "Chinese transcript trust gate rejected all recovery candidates",
                    {
                        "media_id": media_id,
                        "selected_route": selected_route,
                        "trust_attempts": list(trust_attempts),
                        "candidate_summaries": [
                            {
                                "route": snapshot.route,
                                "provider": snapshot.provider,
                                "sentence_count": len(snapshot.sentences),
                                "preview": [sentence.text for sentence in snapshot.sentences[:4]],
                            }
                            for snapshot in candidate_history
                        ],
                        "recovery_actions": chinese_repair_result.as_metrics(),
                        "trust_decision": trust_decision.as_metrics(),
                    },
                )
            all_sentences = []
        else:
            chinese_refine_result = refine_chinese_primary_transcript(
                trusted_candidate_sentences
            )
            trusted_candidate_sentences = chinese_refine_result.sentences
            if not trusted_candidate_sentences:
                raise RuntimeError(
                    "Chinese-primary source cleaning removed all trusted transcript segments"
                )
            final_windows = profile_chinese_transcript_windows(trusted_candidate_sentences)
            trust_decision = trust_gate.evaluate(
                prior=chinese_prior,
                sentences=trusted_candidate_sentences,
                route_id=selected_route,
                diagnostics=dict(route_usage.get("diagnostics", {})),
                probe_details=probe_details,
                stage="post_refine",
                duration_seconds=duration_seconds,
                windows=final_windows,
            )
            trust_attempts.append(
                {
                    "stage": "post_refine",
                    "route": selected_route,
                    "provider": route_usage.get("provider_id") or "",
                    "decision": trust_decision.as_metrics(),
                }
            )
            if not trust_decision.ownership_trusted:
                raise ChineseTrustGateError(
                    "Chinese transcript trust gate rejected refined candidate",
                    {
                        "media_id": media_id,
                        "selected_route": selected_route,
                        "trust_attempts": list(trust_attempts),
                        "candidate_summaries": [
                            {
                                "route": snapshot.route,
                                "provider": snapshot.provider,
                                "sentence_count": len(snapshot.sentences),
                                "preview": [sentence.text for sentence in snapshot.sentences[:4]],
                            }
                            for snapshot in candidate_history
                        ],
                        "recovery_actions": chinese_repair_result.as_metrics(),
                        "trust_decision": trust_decision.as_metrics(),
                    },
                )
            trusted_candidate_batches = _batch_sentences(
                trusted_candidate_sentences, settings.CHUNK_SIZE
            )
            skip_cjk_semantic_merge = True
            apply_chinese_pinyin(trusted_candidate_sentences)
            trusted_source_lang = settings.normalize_language_tag(
                chinese_prior.suspected_family
                or str(
                    route_usage.get("diagnostics", {}).get("detected_lang")
                    or _detect_source_language(trusted_candidate_sentences)
                )
            ) or "zh"
            source_lang_holder[0] = trusted_source_lang
            update_media_status(
                media_id,
                user_id=user_id,
                source_language=trusted_source_lang,
            )
            consumer_task = asyncio.create_task(consumer())
            total_so_far = 0
            for batch in trusted_candidate_batches:
                total_so_far += len(batch)
                await _replay_chunk(batch, total_so_far)
            await queue.put(None)
            _trace(
                "asr_completed",
                route=selected_route,
                provider=selected_provider_id,
                translation_start_policy=effective_translation_policy,
                trust_stage=trust_stage,
            )
            _trace(
                "chinese_primary_refined",
                segment_count=len(trusted_candidate_sentences),
                repair_replacements=len(chinese_repair_result.replacements),
                dropped_count=len(chinese_refine_result.dropped_spans),
                deduped_count=len(chinese_refine_result.deduped_spans),
                normalization_hits=list(chinese_refine_result.normalization_hits),
            )
            logger.info(
                f"🎙️ Trusted Chinese-family transcript established on route={selected_route}; "
                "releasing ASR residency before translation starts"
            )
            await asyncio.to_thread(pipeline.aligner.unload_all)
            all_sentences = await consumer_task
    else:
        producer_task = asyncio.create_task(producer())
        if effective_translation_policy == "after_asr":
            try:
                await producer_task
                route_usage = dict(getattr(pipeline.aligner, "last_route_usage", {}))
                completed_route = str(route_usage.get("actual_route", selected_route))
                _trace(
                    "asr_completed",
                    route=completed_route,
                    provider=route_usage.get("provider_id", selected_provider_id),
                    translation_start_policy=effective_translation_policy,
                )
                logger.info(
                    f"🎙️ ASR complete on route={completed_route}; releasing ASR residency "
                    "before translation starts"
                )
                await asyncio.to_thread(pipeline.aligner.unload_all)
                all_sentences = await consumer()
            except Exception:
                producer_task.cancel()
                if nmt_prefetch_task is not None:
                    nmt_prefetch_task.cancel()
                raise
        else:
            consumer_task = asyncio.create_task(consumer())
            try:
                await producer_task
                route_usage = dict(getattr(pipeline.aligner, "last_route_usage", {}))
                completed_route = str(route_usage.get("actual_route", selected_route))
                _trace(
                    "asr_completed",
                    route=completed_route,
                    provider=route_usage.get("provider_id", selected_provider_id),
                    translation_start_policy=effective_translation_policy,
                )
                all_sentences = await consumer_task
            except Exception:
                producer_task.cancel()
                consumer_task.cancel()
                if nmt_prefetch_task is not None:
                    nmt_prefetch_task.cancel()
                raise

    # ── Step 5: Final metadata + export ──────────────────────────────────
    detected_source_lang = (
        settings.normalize_language_tag(source_lang_holder[0])
        or (_detect_source_language(all_sentences) if all_sentences else "en")
    )
    if not route_usage:
        route_usage = dict(getattr(pipeline.aligner, "last_route_usage", {}))
    actual_route = str(route_usage.get("actual_route") or selected_route)
    actual_provider_id = str(route_usage.get("provider_id") or selected_provider_id)
    model_used = str(route_usage.get("model_id") or selected_model_name)
    source_lang_holder[0] = detected_source_lang
    if detected_source_lang in {"zh", "yue"}:
        apply_chinese_pinyin(all_sentences)

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
            "llm_rescue": round(timing_state["consumer_llm"], 3),
            "upload": round(timing_state["consumer_upload"], 3),
            "idle": round(timing_state["consumer_idle"], 3),
        },
        "producer_wait": round(timing_state["producer_wait"], 3),
        "pipeline_total": round(pipeline_total, 3),
        "route": actual_route,
        "requested_route": selected_route,
        "selected_asr_model": model_used,
        "asr_provider": actual_provider_id,
        "probe_source_lang": probe_source_lang,
        "requested_translation_start_policy": translation_start_policy,
        "translation_start_policy": effective_translation_policy,
        "auto_policy_downgraded": auto_policy_downgraded,
        "nmt_prefetch_used": nmt_prefetch_task is not None,
        "asr_fallback_used": bool(route_usage.get("fallback_used", False)),
        "asr_fallback_chain": list(route_decision.fallback_chain),
        "trust_gate_active": trust_gate_active,
        "trust_stage": trust_stage,
        "trust_attempts": list(trust_attempts),
        "trust_decision": trust_decision.as_metrics() if trust_decision else None,
        "chinese_normalize": chinese_normalize_result.as_metrics(),
        "chinese_repair": chinese_repair_result.as_metrics(),
        "chinese_refine": chinese_refine_result.as_metrics(),
        "chinese_llm_rescue": chinese_llm_metrics,
        "chinese_prior": {
            "prior_score": chinese_prior.prior_score,
            "suspected_family": chinese_prior.suspected_family,
            "confidence_band": chinese_prior.confidence_band,
            "sources": list(chinese_prior.sources),
            "probe_source_lang": chinese_prior.probe_source_lang,
            "probe_near_tie": chinese_prior.probe_near_tie,
            "probe_scores": list(chinese_prior.probe_scores),
        },
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
