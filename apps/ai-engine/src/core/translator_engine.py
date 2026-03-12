"""
TranslatorEngine — Analyze-Once, Translate-Streaming with Sliding Context.

Architecture:
  Step A: Context Analysis (one LLM call)
    Smart sampling: 5 segments from beginning + 5 middle + 5 end.
    Detects style, tone, glossary, pronoun relationships.

  Step B: Batched Translation (N LLM calls, streaming)
    Batch size: 15 sentences.
    Each batch receives global context + sliding window of last 3 translations.
    Partial failure: mark segments "[Translation Pending]" and continue.
"""

from __future__ import annotations

from typing import Callable, List, Optional

from loguru import logger

from src.core.llm_provider import LLMProvider
from src.core.prompts import (
    TRANSLATE_EN_PROMPT,
    TRANSLATE_GENERIC_PROMPT,
    TRANSLATE_VI_PROMPT,
)
from src.schemas import (
    ContextAnalysis,
    ContextAnalysisResult,
    LanguageConfig,
    Sentence,
    TranslatedSentence,
    TranslationStyle,
    VietnamesePronoun,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TRANSLATION_BATCH_SIZE = 15
CONTEXT_SAMPLE_SIZE = 5  # per segment (beginning, middle, end)
SLIDING_WINDOW_SIZE = 3

# ---------------------------------------------------------------------------
# Language Configuration Registry
# Adding a new language = one entry here + one prompt template in prompts.py
# ---------------------------------------------------------------------------

LANGUAGE_CONFIGS: dict[str, LanguageConfig] = {
    "vi": LanguageConfig(
        code="vi",
        name="Vietnamese",
        prompt_key="vi",
        has_pronouns=True,
    ),
    "en": LanguageConfig(
        code="en",
        name="English",
        prompt_key="en",
        has_pronouns=False,
    ),
}

# Map prompt_key → template string
_PROMPT_TEMPLATES: dict[str, str] = {
    "vi": TRANSLATE_VI_PROMPT,
    "en": TRANSLATE_EN_PROMPT,
    "generic": TRANSLATE_GENERIC_PROMPT,
}


class TranslatorEngine:
    """Bilingual translation engine with context analysis and streaming batches."""

    def __init__(self, llm: LLMProvider) -> None:
        self.llm = llm

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def translate(
        self,
        sentences: List[Sentence],
        source_lang: str,
        target_lang: str,
        profile: str = "standard",
        on_batch_complete: Optional[
            Callable[[int, List[TranslatedSentence]], None]
        ] = None,
    ) -> List[TranslatedSentence]:
        """
        Translate *sentences* with context-aware batching.

        Args:
            sentences: Source sentences (from SemanticMerger).
            source_lang: Detected source language code (e.g. "zh", "en").
            target_lang: Target language code (e.g. "vi", "en").
            profile: Audio profile from AudioInspector ("music", "standard").
            on_batch_complete: Callback(batch_index, translated_batch) fired
                after each batch is translated — used for Tier 2 streaming.

        Returns:
            List of TranslatedSentence with translations populated.
        """
        if not sentences:
            return []

        lang_config = LANGUAGE_CONFIGS.get(
            target_lang,
            LanguageConfig(
                code=target_lang,
                name=target_lang.upper(),
                prompt_key="generic",
                has_pronouns=False,
            ),
        )

        logger.info(
            f"🌐 TranslatorEngine: {len(sentences)} sentences, "
            f"{source_lang}→{target_lang} (profile={profile})"
        )

        # Step A — Context Analysis (one LLM call)
        context = self._analyze_context(
            sentences, source_lang, target_lang, lang_config
        )

        # Step B — Batched Translation with sliding context
        return self._translate_batches(
            sentences,
            source_lang,
            target_lang,
            context,
            lang_config,
            on_batch_complete=on_batch_complete,
        )

    # ------------------------------------------------------------------
    # Step A: Context Analysis
    # ------------------------------------------------------------------

    def _smart_sample(self, sentences: List[Sentence]) -> List[str]:
        """Sample 5 from beginning + 5 from middle + 5 from end."""
        n = len(sentences)
        if n <= CONTEXT_SAMPLE_SIZE * 3:
            return [s.text for s in sentences]

        begin = sentences[:CONTEXT_SAMPLE_SIZE]
        mid_start = (n // 2) - (CONTEXT_SAMPLE_SIZE // 2)
        middle = sentences[mid_start : mid_start + CONTEXT_SAMPLE_SIZE]
        end = sentences[-CONTEXT_SAMPLE_SIZE:]

        sampled = begin + middle + end
        return [s.text for s in sampled]

    def _analyze_context(
        self,
        sentences: List[Sentence],
        source_lang: str,
        target_lang: str,
        lang_config: LanguageConfig,
    ) -> ContextAnalysis:
        """One-shot context analysis via LLM with smart sampling."""
        samples = self._smart_sample(sentences)
        logger.info(
            f"📊 Context analysis: {len(samples)} sampled segments "
            f"(from {len(sentences)} total)"
        )

        try:
            result: ContextAnalysisResult = self.llm.analyze_context(
                samples, target_lang
            )

            language_specific: dict = {}
            if lang_config.has_pronouns and result.detected_pronouns:
                language_specific["pronouns"] = result.detected_pronouns.value

            analysis = ContextAnalysis(
                detected_style=result.detected_style,
                summary=result.summary,
                keywords=result.keywords,
                language_specific=language_specific,
            )
            logger.info(
                f"📊 Context: style={analysis.detected_style.value}, "
                f"lang_specific={analysis.language_specific}"
            )
            return analysis

        except Exception as e:
            logger.error(f"Context analysis failed, using defaults: {e}")
            return ContextAnalysis(
                detected_style=TranslationStyle.NEUTRAL,
                summary="Context analysis unavailable.",
                keywords=[],
                language_specific=(
                    {"pronouns": VietnamesePronoun.TOI_BAN.value}
                    if lang_config.has_pronouns
                    else {}
                ),
            )

    # ------------------------------------------------------------------
    # Step B: Batched Translation
    # ------------------------------------------------------------------

    def _translate_batches(
        self,
        sentences: List[Sentence],
        source_lang: str,
        target_lang: str,
        context: ContextAnalysis,
        lang_config: LanguageConfig,
        *,
        on_batch_complete: Optional[
            Callable[[int, List[TranslatedSentence]], None]
        ] = None,
    ) -> List[TranslatedSentence]:
        """Translate in batches with a sliding window for continuity."""
        all_translated: List[TranslatedSentence] = []
        sliding_window: List[str] = []

        total_batches = max(
            1,
            (len(sentences) + TRANSLATION_BATCH_SIZE - 1) // TRANSLATION_BATCH_SIZE,
        )

        for batch_idx in range(total_batches):
            start = batch_idx * TRANSLATION_BATCH_SIZE
            end = min(start + TRANSLATION_BATCH_SIZE, len(sentences))
            batch_sentences = sentences[start:end]
            batch_texts = [s.text for s in batch_sentences]

            # Build the language-specific system prompt
            system_prompt = self._build_system_prompt(
                context, lang_config, target_lang, sliding_window
            )

            try:
                translations = self.llm.translate_raw(batch_texts, system_prompt)

                if not translations or len(translations) != len(batch_texts):
                    logger.warning(
                        f"Batch {batch_idx}: count mismatch or empty — "
                        f"marking as pending"
                    )
                    translations = ["[Translation Pending]"] * len(batch_texts)
                    batch_failed = True
                else:
                    batch_failed = False

            except Exception as e:
                logger.error(f"Batch {batch_idx} failed: {e}")
                translations = ["[Translation Pending]"] * len(batch_texts)
                batch_failed = True

            # Build TranslatedSentence objects
            batch_translated: List[TranslatedSentence] = []
            for sent, trans in zip(batch_sentences, translations):
                batch_translated.append(
                    TranslatedSentence(
                        text=sent.text,
                        start=sent.start,
                        end=sent.end,
                        words=sent.words,
                        translation=trans,
                    )
                )

            all_translated.extend(batch_translated)

            # Only update sliding window with real translations (not failure markers)
            if not batch_failed:
                sliding_window = translations[-SLIDING_WINDOW_SIZE:]

            # Fire Tier 2 streaming callback
            if on_batch_complete:
                try:
                    on_batch_complete(batch_idx, batch_translated)
                except Exception as cb_err:
                    logger.error(f"on_batch_complete callback failed: {cb_err}")

            logger.info(
                f"📝 Batch {batch_idx + 1}/{total_batches} translated "
                f"({len(batch_texts)} sentences)"
            )

        return all_translated

    # ------------------------------------------------------------------
    # Prompt Construction
    # ------------------------------------------------------------------

    def _build_system_prompt(
        self,
        context: ContextAnalysis,
        lang_config: LanguageConfig,
        target_lang: str,
        sliding_window: List[str],
    ) -> str:
        """Build a fully-formatted system prompt for the current batch."""
        template = _PROMPT_TEMPLATES.get(
            lang_config.prompt_key,
            _PROMPT_TEMPLATES["generic"],
        )

        # Sliding context section
        if sliding_window:
            sliding_text = (
                "\nFor continuity, here are the last few translations from "
                "the previous batch (DO NOT re-translate these — use them "
                "only as context for tone and flow):\n"
                + "\n".join(f"  - {t}" for t in sliding_window)
            )
        else:
            sliding_text = ""

        keywords_str = ", ".join(context.keywords) if context.keywords else "None"

        # Common placeholders
        format_kwargs: dict = {
            "style": context.detected_style.value,
            "summary": context.summary,
            "keywords": keywords_str,
            "sliding_context": sliding_text,
        }

        # Vietnamese-specific placeholders
        if lang_config.prompt_key == "vi":
            pronouns = context.language_specific.get(
                "pronouns", VietnamesePronoun.TOI_BAN.value
            )
            parts = [p.strip() for p in pronouns.split("/")]
            format_kwargs["pronouns"] = pronouns
            format_kwargs["pronoun_first"] = parts[0] if len(parts) >= 1 else "Tôi"
            format_kwargs["pronoun_second"] = parts[1] if len(parts) >= 2 else "Bạn"

        # Generic prompt needs target_lang
        if lang_config.prompt_key == "generic":
            format_kwargs["target_lang"] = target_lang

        return template.format(**format_kwargs)
