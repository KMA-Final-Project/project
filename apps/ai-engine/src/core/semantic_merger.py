from __future__ import annotations

import json
from typing import List, Literal, Set
from loguru import logger
from pydantic import BaseModel

from src.schemas import Sentence, Word
from src.core.llm_provider import LLMProvider
from src.core.prompts import SAFE_MERGE_CJK_PROMPT, SAFE_MERGE_NON_CJK_PROMPT

BATCH_SIZE = 30
OVERLAP_LINES = 3


class MergedLine(BaseModel):
    text: str
    source_indices: List[int]


def _is_cjk(source_lang: str) -> bool:
    """Check if the source language is CJK (Chinese/Japanese/Korean)."""
    return source_lang.lower() in ("zh", "ja", "ko")


MERGE_MIN_WORD_COUNT = 6
MERGE_FRAGMENT_RATIO = 0.2


class SemanticMerger:
    """
    Language-Aware Semantic Merging with Batching.

    - CJK (zh, ja, ko): Groups broken lines + corrects homophones (char-count validated).
    - Non-CJK (en, vi, …): Groups broken lines into sentences only — no homophone correction.
    - Batches ~30 segments at a time with 2-3 overlap lines for context continuity.
    - Skips entirely when segment count <= 3 (not worth an LLM call).
    """

    def __init__(self) -> None:
        self.llm = LLMProvider()

    @staticmethod
    def needs_merge(sentences: List[Sentence], source_lang: str = "en") -> bool:
        """Quick heuristic: does this batch contain enough fragments to justify an LLM merge call?"""
        if not sentences:
            return False
        cjk = _is_cjk(source_lang)
        fragment_count = 0
        for s in sentences:
            text = s.text.strip()
            if cjk:
                if len(text) < 8:
                    fragment_count += 1
            else:
                if len(text.split()) < MERGE_MIN_WORD_COUNT:
                    fragment_count += 1
        return fragment_count >= len(sentences) * MERGE_FRAGMENT_RATIO

    def process(
        self,
        sentences: List[Sentence],
        source_lang: str = "en",
        context_style: str = "Speech/Dialogue",
    ) -> List[List[Sentence]]:
        """
        Process raw ASR sentences into ordered batch groups.

        Returns a list of batch groups — each group is a list of merged
        Sentence objects at sentence boundaries.  These groups feed directly
        into TranslatorEngine as translation batches (Tier 2).
        """
        if not sentences:
            return []

        if len(sentences) <= 3:
            logger.info(f"⏭️ Skipping SemanticMerger ({len(sentences)} segments ≤ 3)")
            return [sentences]

        cjk = _is_cjk(source_lang)
        prompt_template = SAFE_MERGE_CJK_PROMPT if cjk else SAFE_MERGE_NON_CJK_PROMPT
        mode_label = "CJK (group+homophone)" if cjk else "Non-CJK (group only)"

        logger.info(
            f"🧠 SemanticMerger: {len(sentences)} segments | "
            f"lang={source_lang} | mode={mode_label} | style={context_style}"
        )

        batches = self._create_batches(sentences)
        logger.info(
            f"   Split into {len(batches)} batches (batch_size={BATCH_SIZE}, overlap={OVERLAP_LINES})"
        )

        all_batch_groups: List[List[Sentence]] = []

        for batch_idx, (batch_sentences, global_offset) in enumerate(batches):
            is_last_batch = batch_idx == len(batches) - 1
            # Core size = how many segments this batch "owns".
            # Non-last batches exclude the trailing overlap (belongs to next batch).
            core_size = (
                len(batch_sentences)
                if is_last_batch
                else len(batch_sentences) - OVERLAP_LINES
            )
            logger.info(
                f"   Processing batch {batch_idx + 1}/{len(batches)} "
                f"({len(batch_sentences)} segments, core={core_size})"
            )
            try:
                merged = self._process_batch(
                    batch_sentences,
                    global_offset,
                    prompt_template,
                    context_style,
                    cjk,
                    core_size=core_size,
                )
                all_batch_groups.append(merged)
            except Exception as e:
                logger.error(
                    f"   Batch {batch_idx + 1} failed: {e} — returning originals for this batch"
                )
                all_batch_groups.append(batch_sentences[:core_size])

        total_out = sum(len(g) for g in all_batch_groups)
        logger.success(
            f"✨ SemanticMerger complete: {len(sentences)} → {total_out} segments in {len(all_batch_groups)} batches"
        )
        return all_batch_groups

    # ------------------------------------------------------------------
    # Batching
    # ------------------------------------------------------------------

    def _create_batches(
        self, sentences: List[Sentence]
    ) -> List[tuple[List[Sentence], int]]:
        """
        Split sentences into batches of ~BATCH_SIZE with OVERLAP_LINES overlap.

        Returns list of (batch_sentences, global_start_index) tuples.
        The overlap lines provide context continuity but are discarded from
        earlier batches' output (they belong to the next batch).
        """
        if len(sentences) <= BATCH_SIZE:
            return [(sentences, 0)]

        batches: List[tuple[List[Sentence], int]] = []
        start = 0

        while start < len(sentences):
            end = min(start + BATCH_SIZE, len(sentences))
            batch = sentences[start:end]
            batches.append((batch, start))

            # Next batch starts BATCH_SIZE - OVERLAP_LINES after current start
            next_start = start + BATCH_SIZE - OVERLAP_LINES
            if next_start >= len(sentences):
                break
            # If remaining sentences after overlap are too few, absorb them
            if len(sentences) - next_start <= OVERLAP_LINES:
                break
            start = next_start

        return batches

    # ------------------------------------------------------------------
    # Per-batch LLM processing
    # ------------------------------------------------------------------

    def _process_batch(
        self,
        batch_sentences: List[Sentence],
        global_offset: int,
        prompt_template: str,
        context_style: str,
        cjk: bool,
        core_size: int | None = None,
    ) -> List[Sentence]:
        """Run one batch through the LLM and reconstruct validated Sentences."""
        if core_size is None:
            core_size = len(batch_sentences)

        # Build indexed input (strip whitespace to avoid LLM mismatches)
        # The LLM sees ALL sentences (including overlap for context),
        # but only core indices will be emitted in the output.
        input_lines = [f"[{i}] {s.text.strip()}" for i, s in enumerate(batch_sentences)]
        input_text = "\n".join(input_lines)

        prompt = prompt_template.format(context_style=context_style)
        prompt += f"\n\nINPUT DATA:\n{input_text}\n"

        response = self.llm.generate(prompt)
        merged_data = self._parse_response(response)

        if not merged_data:
            logger.warning("   No valid merged data — keeping originals for this batch")
            return batch_sentences[:core_size]

        return self._reconstruct(batch_sentences, merged_data, cjk, core_size=core_size)

    # ------------------------------------------------------------------
    # Reconstruction & validation
    # ------------------------------------------------------------------

    def _reconstruct(
        self,
        batch_sentences: List[Sentence],
        merged_data: List[MergedLine],
        cjk: bool,
        core_size: int | None = None,
    ) -> List[Sentence]:
        """Rebuild Sentence objects from LLM merge output with validation.

        Only indices in [0, core_size) are emitted.  Indices >= core_size
        are overlap context that belongs to the next batch.
        """
        if core_size is None:
            core_size = len(batch_sentences)

        new_sentences: List[Sentence] = []
        # Track which source indices have already been consumed to avoid
        # duplicates and to enable a full-coverage fallback.
        seen_indices: Set[int] = set()

        for item in merged_data:
            indices = item.source_indices
            merged_text = item.text

            if not indices:
                continue
            # Filter to in-range and not-yet-seen indices, preserving order.
            filtered_indices: List[int] = []
            for idx in indices:
                if 0 <= idx < len(batch_sentences) and idx not in seen_indices:
                    filtered_indices.append(idx)
            if not filtered_indices:
                # All indices were out of range or already consumed.
                continue

            # Check if this merge spans into the overlap zone.
            core_indices = [i for i in filtered_indices if i < core_size]
            overlap_indices = [i for i in filtered_indices if i >= core_size]

            if overlap_indices:
                # Merge crosses the core/overlap boundary — reject it.
                # Keep only the core originals; overlap belongs to next batch.
                seen_indices.update(filtered_indices)
                for idx in core_indices:
                    new_sentences.append(batch_sentences[idx])
                continue

            # All indices are within core range — proceed with validation.
            source_sents = [batch_sentences[idx] for idx in filtered_indices]

            if cjk:
                # CJK: strict char-count validation (homophone correction)
                original_combined = "".join(s.text.strip() for s in source_sents)
                if len(merged_text) != len(original_combined):
                    logger.warning(
                        f"   Length mismatch for indices {filtered_indices}: "
                        f"'{original_combined}'({len(original_combined)}) vs "
                        f"'{merged_text}'({len(merged_text)}). REJECTING."
                    )

                    # Mark these indices as seen to avoid repeated attempts, but keep original sentences.
                    seen_indices.update(filtered_indices)
                    new_sentences.extend(source_sents)
                    continue
            else:
                # Non-CJK: validate that the LLM did not alter the text content.
                # The merged text must be the exact concatenation of the source texts.
                # Strip individual texts to normalize leading/trailing whitespace
                # from upstream Whisper output.
                original_combined = " ".join(s.text.strip() for s in source_sents)
                if merged_text.strip() != original_combined:
                    logger.warning(
                        f"   Text mismatch for indices {filtered_indices}: "
                        f"expected '{original_combined}' but got '{merged_text}'. REJECTING."
                    )
                    # Fall back to the original sentences to preserve alignment.
                    seen_indices.update(filtered_indices)
                    new_sentences.extend(source_sents)
                    continue

            # Build merged Sentence
            first_seg = source_sents[0]
            last_seg = source_sents[-1]

            all_words: List[Word] = []
            for s in source_sents:
                all_words.extend(s.words if s.words else [])

            # CJK: update individual characters in word objects if counts match
            if cjk and len(all_words) == len(merged_text):
                for idx, char in enumerate(merged_text):
                    all_words[idx].word = char

            new_sentences.append(
                Sentence(
                    text=merged_text,
                    start=first_seg.start,
                    end=last_seg.end,
                    words=all_words,
                )
            )
            # Mark indices used in this merged sentence as consumed.
            seen_indices.update(filtered_indices)

        # Fallback: append any original sentences that were never referenced
        # in merged_data so that no segments are lost.  Only for core indices.
        for idx in range(core_size):
            if idx not in seen_indices:
                new_sentences.append(batch_sentences[idx])

        return new_sentences

    # ------------------------------------------------------------------
    # Response parsing
    # ------------------------------------------------------------------

    def _parse_response(self, response: str) -> List[MergedLine]:
        """Parse JSON list of MergedLine objects from LLM response."""
        try:
            clean_resp = response.strip()
            if "```json" in clean_resp:
                clean_resp = clean_resp.split("```json")[1].split("```")[0].strip()
            elif "```" in clean_resp:
                clean_resp = clean_resp.split("```")[1].split("```")[0].strip()

            data = json.loads(clean_resp)
            results: List[MergedLine] = []
            for item in data:
                if "text" in item and "source_indices" in item:
                    results.append(MergedLine(**item))
            return results
        except Exception as e:
            logger.error(f"   Error parsing merge response: {e}")
            return []
