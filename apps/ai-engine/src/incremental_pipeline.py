"""
IncrementalPipeline — accumulate transcription chunks and flush
through merge → translate in a background thread.

Extracted from main.py for readability.  All heavy LLM work runs in
a single-worker ``ThreadPoolExecutor`` so SmartAligner can keep
transcribing in parallel.
"""

from __future__ import annotations

import json
from concurrent.futures import Future, ThreadPoolExecutor
from pathlib import Path
from typing import Callable

from loguru import logger

from src.core.prompts import SAFE_MERGE_CJK_PROMPT, SAFE_MERGE_NON_CJK_PROMPT
from src.core.semantic_merger import OVERLAP_LINES, SemanticMerger, _is_cjk
from src.core.translator_engine import (
    LANGUAGE_CONFIGS,
    TRANSLATION_BATCH_SIZE,
    TranslatorEngine,
)
from src.events import publish_batch_ready
from src.minio_client import MinioClient
from src.schemas import (
    ContextAnalysis,
    LanguageConfig,
    Sentence,
    TranslatedBatch,
    TranslatedSentence,
)

# Sentences to accumulate before triggering a merge+translate cycle
MERGE_ACCUMULATOR_THRESHOLD = 30

_DEBUG_DIR = Path(__file__).resolve().parent.parent / "outputs" / "debug"


class IncrementalPipeline:
    """Accumulates transcribed sentences and flushes through merge→translate incrementally.

    Instead of waiting for all transcription to finish before merging and translating,
    this class processes batches of ~30 sentences as they arrive from SmartAligner.
    Each flush runs: optional SemanticMerger → TranslatorEngine → Tier 2 stream.

    Flush operations run in a single background thread so that SmartAligner
    transcription continues in parallel with LLM merge+translate calls.
    """

    def __init__(
        self,
        merger: SemanticMerger,
        translator: TranslatorEngine,
        minio_client: MinioClient,
        media_id: str,
        user_id: str,
        target_lang: str,
        context_style: str,
        on_progress: Callable[[float, str], None],
    ) -> None:
        self._merger = merger
        self._translator = translator
        self._minio = minio_client
        self._media_id = media_id
        self._user_id = user_id
        self._target_lang = target_lang
        self._context_style = context_style
        self._on_progress = on_progress

        self._buffer: list[Sentence] = []
        self._overlap: list[Sentence] = []
        self._translated_all: list[TranslatedSentence] = []
        self._batch_index: int = 0
        self._total_translated: int = 0
        self._total_fed: int = 0

        self._source_lang: str = ""
        self._context: ContextAnalysis | None = None
        self._sliding_window: list[str] = []
        self._lang_config: LanguageConfig | None = None

        # Single-worker thread pool: flushes are sequential but run in the
        # background so SmartAligner transcription can continue in parallel.
        self._executor = ThreadPoolExecutor(
            max_workers=1, thread_name_prefix="incr-flush"
        )
        self._pending_futures: list[Future] = []
        self._flush_error: Exception | None = None

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def source_lang(self) -> str:
        return self._source_lang

    @source_lang.setter
    def source_lang(self, value: str) -> None:
        self._source_lang = value

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def feed(self, sentences: list[Sentence]) -> None:
        """Add sentences from SmartAligner. Submits flush to background thread when buffer is large enough."""
        self._buffer.extend(sentences)
        self._total_fed += len(sentences)
        while len(self._buffer) >= MERGE_ACCUMULATOR_THRESHOLD:
            # Drain batch from buffer and set overlap synchronously so the
            # next feed() call has the correct overlap context.
            batch = self._overlap + self._buffer[:MERGE_ACCUMULATOR_THRESHOLD]
            self._buffer = self._buffer[MERGE_ACCUMULATOR_THRESHOLD:]
            self._overlap = batch[-OVERLAP_LINES:]

            # Submit flush to background thread (non-blocking)
            future = self._executor.submit(self._flush_batch_work, batch, False)
            self._pending_futures.append(future)

    def finalize(self) -> list[TranslatedSentence]:
        """Flush remaining sentences and wait for all background flushes to complete."""
        if self._buffer:
            batch = self._overlap + self._buffer
            self._buffer = []
            self._overlap = []
            future = self._executor.submit(self._flush_batch_work, batch, True)
            self._pending_futures.append(future)

        # Wait for all pending flushes to finish
        for future in self._pending_futures:
            future.result()  # raises if the flush raised
        self._pending_futures.clear()
        self._executor.shutdown(wait=False)

        if self._flush_error:
            logger.error(f"Incremental pipeline had flush errors: {self._flush_error}")

        return self._translated_all

    # ------------------------------------------------------------------
    # Background flush worker
    # ------------------------------------------------------------------

    def _flush_batch_work(self, batch: list[Sentence], is_final: bool) -> None:
        """Process one batch: merge (if needed) → translate → stream Tier 2.

        Runs in the background flush thread.
        """
        if not batch:
            return

        try:
            core_size = len(batch) if is_final else len(batch) - OVERLAP_LINES
            source_lang = self._source_lang or "en"
            cjk = _is_cjk(source_lang)

            # Option D: merge only when needed
            if len(batch) > 3 and self._merger.needs_merge(batch, source_lang):
                prompt_template = (
                    SAFE_MERGE_CJK_PROMPT if cjk else SAFE_MERGE_NON_CJK_PROMPT
                )
                try:
                    merged = self._merger._process_batch(
                        batch,
                        0,
                        prompt_template,
                        self._context_style,
                        cjk,
                        core_size=core_size,
                    )
                    logger.info(
                        f"🧠 Incremental merge: {len(batch)} → {len(merged)} segments"
                    )
                except Exception as e:
                    logger.error(f"Incremental merge failed: {e} — using originals")
                    merged = list(batch[:core_size])
            else:
                logger.info(
                    f"⏭️ Skipping merge for batch ({core_size} well-formed sentences)"
                )
                merged = list(batch[:core_size])

            # Skip translation if source == target
            if source_lang == self._target_lang:
                self._translated_all.extend(merged)
                self._total_translated += len(merged)
                return

            # Lazy context analysis on first flush
            if self._context is None:
                self._lang_config = LANGUAGE_CONFIGS.get(
                    self._target_lang,
                    LanguageConfig(
                        code=self._target_lang,
                        name=self._target_lang.upper(),
                        prompt_key="generic",
                        has_pronouns=False,
                    ),
                )
                self._context = self._translator.analyze_context(
                    merged, source_lang, self._target_lang
                )

            # Translate in sub-batches of TRANSLATION_BATCH_SIZE
            for i in range(0, len(merged), TRANSLATION_BATCH_SIZE):
                sub_batch = merged[i : i + TRANSLATION_BATCH_SIZE]

                translated, self._sliding_window = (
                    self._translator.translate_single_batch(
                        sub_batch,
                        source_lang,
                        self._target_lang,
                        self._context,
                        self._lang_config,
                        self._sliding_window,
                    )
                )

                self._translated_all.extend(translated)
                self._total_translated += len(translated)

                # Upload Tier 2 batch
                tb = TranslatedBatch(batch_index=self._batch_index, segments=translated)
                _batch_key, batch_url = self._minio.upload_translated_batch(
                    self._media_id, tb
                )

                # Combined progress: transcription weight + translation weight
                trans_frac = self._total_fed / max(self._total_fed + 20, 1)
                transl_frac = (
                    self._total_translated / self._total_fed
                    if self._total_fed > 0
                    else 0
                )
                progress = min(0.90, 0.15 + trans_frac * 0.45 + transl_frac * 0.30)

                publish_batch_ready(
                    media_id=self._media_id,
                    user_id=self._user_id,
                    batch_index=self._batch_index,
                    url=batch_url,
                    segment_count=len(translated),
                    progress=progress,
                )
                self._on_progress(progress, "PROCESSING")
                self._batch_index += 1

                # Dump debug snapshot after upload
                self._dump_debug(self._batch_index, batch, merged, translated)

                logger.info(
                    f"📝 Tier 2 batch {self._batch_index} streamed "
                    f"({len(translated)} sentences, {self._total_translated} total translated)"
                )
        except Exception as e:
            logger.error(f"Flush batch failed: {e}")
            self._flush_error = e
            raise

    # ------------------------------------------------------------------
    # Debug helper
    # ------------------------------------------------------------------

    def _dump_debug(
        self,
        batch_num: int,
        raw_batch: list[Sentence],
        merged: list,
        translated: list[TranslatedSentence],
    ) -> None:
        """Write a per-batch debug JSON to outputs/debug/<media_id>/."""
        try:
            out_dir = _DEBUG_DIR / self._media_id
            out_dir.mkdir(parents=True, exist_ok=True)
            payload = {
                "batch_num": batch_num,
                "raw_input_count": len(raw_batch),
                "raw_input": [
                    {"text": s.text, "start": s.start, "end": s.end} for s in raw_batch
                ],
                "merged_count": len(merged),
                "merged": [
                    (
                        {"text": s.text, "start": s.start, "end": s.end}
                        if hasattr(s, "text")
                        else str(s)
                    )
                    for s in merged
                ],
                "translated_count": len(translated),
                "translated": [
                    {
                        "text": s.text,
                        "translation": s.translation,
                        "start": s.start,
                        "end": s.end,
                    }
                    for s in translated
                ],
            }
            fp = out_dir / f"batch_{batch_num:03d}.json"
            fp.write_text(
                json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            logger.debug(f"Debug snapshot written: {fp}")
        except Exception as e:
            logger.warning(f"Failed to write debug snapshot: {e}")
