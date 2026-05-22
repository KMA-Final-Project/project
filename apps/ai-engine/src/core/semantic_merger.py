from __future__ import annotations

import json
from typing import List, Set
from loguru import logger
from pydantic import BaseModel

from src.core.subtitle_text import build_sentence_text_from_words
from src.schemas import Sentence, Word
from src.core.llm_provider import LLMProvider
from src.core.prompts import SAFE_MERGE_CJK_PROMPT, SAFE_MERGE_NON_CJK_PROMPT

BATCH_SIZE = 30
OVERLAP_LINES = 3


class MergedLine(BaseModel):
    text: str | None = None
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
        into NMT translation as translation batches.
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

    def process_stream_window(
        self,
        sentences: List[Sentence],
        *,
        source_lang: str = "en",
        context_style: str = "Speech/Dialogue",
        core_size: int | None = None,
    ) -> tuple[List[Sentence], int]:
        """Process a streaming merge window and return the committed prefix.

        Args:
            sentences: Entire buffered window, including trailing lookahead lines.
            source_lang: Source language of the buffered window.
            context_style: Style hint for the merger prompt.
            core_size: Number of leading source sentences that are eligible to emit.

        Returns:
            Tuple of ``(emitted_sentences, retain_from_index)`` where
            ``retain_from_index`` is the first source sentence index that must stay in
            the buffer for the next window.
        """
        if not sentences:
            return [], 0

        if core_size is None:
            core_size = len(sentences)
        core_size = max(0, min(core_size, len(sentences)))
        if core_size == 0:
            return [], 0

        if len(sentences) <= 3 or not self.needs_merge(sentences, source_lang):
            return list(sentences[:core_size]), core_size

        cjk = _is_cjk(source_lang)
        prompt_template = SAFE_MERGE_CJK_PROMPT if cjk else SAFE_MERGE_NON_CJK_PROMPT

        try:
            merged_data = self._request_batch_merge(
                sentences,
                prompt_template,
                context_style,
            )
        except Exception as exc:
            logger.error(f"   Stream merge failed: {exc} — keeping window originals")
            return list(sentences[:core_size]), core_size

        if not merged_data:
            logger.warning("   No valid stream merge data — keeping window originals")
            return list(sentences[:core_size]), core_size

        return self._reconstruct_stream_window(
            sentences,
            merged_data,
            cjk,
            core_size=core_size,
        )

    def correct_homophones(
        self,
        sentences: list[Sentence],
        context_style: str = "Speech/Dialogue",
    ) -> list[Sentence]:
        """CJK homophone correction without sentence merging.

        For CJK sentences that are already well-formed (needs_merge() returned False)
        but may still have homophone errors from Whisper (e.g., 他/她/它, 的/地/得).

        Uses the same CJK LLM prompt and _process_batch() infrastructure as process().
        The strict char-count validation in _reconstruct() naturally rejects any accidental
        merge attempts by the LLM — only same-length corrections pass through.
        """
        if not sentences:
            return []
        if len(sentences) <= 3:
            logger.info(
                f"⏭️ Skipping homophone correction ({len(sentences)} segments ≤ 3)"
            )
            return list(sentences)

        logger.info(
            f"🔤 Homophone correction: {len(sentences)} CJK segments | style={context_style}"
        )
        batches = self._create_batches(sentences)
        result: list[Sentence] = []

        for batch_idx, (batch_sentences, global_offset) in enumerate(batches):
            is_last_batch = batch_idx == len(batches) - 1
            core_size = (
                len(batch_sentences)
                if is_last_batch
                else len(batch_sentences) - OVERLAP_LINES
            )
            try:
                corrected = self._process_batch(
                    batch_sentences,
                    global_offset,
                    SAFE_MERGE_CJK_PROMPT,
                    context_style,
                    cjk=True,
                    core_size=core_size,
                )
                result.extend(corrected)
            except Exception as e:
                logger.error(
                    f"   Homophone batch {batch_idx + 1} failed: {e} — keeping originals"
                )
                result.extend(batch_sentences[:core_size])

        logger.success(
            f"✨ Homophone correction complete: {len(sentences)} → {len(result)} segments"
        )
        return result

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

        merged_data = self._request_batch_merge(
            batch_sentences,
            prompt_template,
            context_style,
        )

        if not merged_data:
            logger.warning("   No valid merged data — keeping originals for this batch")
            return batch_sentences[:core_size]

        return self._reconstruct(batch_sentences, merged_data, cjk, core_size=core_size)

    def _request_batch_merge(
        self,
        batch_sentences: List[Sentence],
        prompt_template: str,
        context_style: str,
    ) -> List[MergedLine]:
        """Send one indexed sentence batch to the LLM and parse its merge plan."""
        # Build indexed input (strip whitespace to avoid LLM mismatches)
        input_lines = [f"[{i}] {s.text.strip()}" for i, s in enumerate(batch_sentences)]
        input_text = "\n".join(input_lines)

        prompt = prompt_template.format(context_style=context_style)
        prompt += f"\n\nINPUT DATA:\n{input_text}\n"

        response = self.llm.generate(prompt)
        return self._parse_response(response)

    @staticmethod
    def _build_sentence_from_sources(
        source_sents: List[Sentence],
        *,
        cjk: bool,
        merged_text: str | None = None,
    ) -> Sentence:
        first_seg = source_sents[0]
        last_seg = source_sents[-1]

        all_words: List[Word] = []
        for sentence in source_sents:
            all_words.extend(sentence.words if sentence.words else [])

        if cjk:
            text = (merged_text or "").strip()
            if len(all_words) == len(text):
                for idx, char in enumerate(text):
                    all_words[idx].word = char
        else:
            text = build_sentence_text_from_words(all_words)

        return Sentence(
            text=text,
            start=first_seg.start,
            end=last_seg.end,
            words=all_words,
            detected_lang=first_seg.detected_lang,
        )

    @staticmethod
    def _validate_index_group(
        indices: List[int],
        batch_len: int,
    ) -> List[int]:
        valid_indices = [idx for idx in indices if 0 <= idx < batch_len]
        if not valid_indices:
            return []
        if len(set(valid_indices)) != len(valid_indices):
            logger.warning(
                f"   Duplicate source indices in merge group {indices}. IGNORING GROUP."
            )
            return []
        if valid_indices != sorted(valid_indices):
            logger.warning(
                f"   Out-of-order source indices in merge group {indices}. IGNORING GROUP."
            )
            return []
        contiguous = list(range(valid_indices[0], valid_indices[-1] + 1))
        if valid_indices != contiguous:
            logger.warning(
                f"   Non-contiguous source indices in merge group {indices}. IGNORING GROUP."
            )
            return []
        return valid_indices

    def _validate_and_build_sentence(
        self,
        source_sents: List[Sentence],
        *,
        indices: List[int],
        cjk: bool,
        merged_text: str | None,
    ) -> Sentence | None:
        if cjk:
            original_combined = "".join(s.text.strip() for s in source_sents)
            if not merged_text:
                logger.warning(
                    f"   Missing corrected text for CJK indices {indices}. REJECTING."
                )
                return None
            if len(merged_text) != len(original_combined):
                logger.warning(
                    f"   Length mismatch for indices {indices}: "
                    f"'{original_combined}'({len(original_combined)}) vs "
                    f"'{merged_text}'({len(merged_text)}). REJECTING."
                )
                return None

        return self._build_sentence_from_sources(
            source_sents,
            cjk=cjk,
            merged_text=merged_text,
        )

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
            indices = self._validate_index_group(
                item.source_indices, len(batch_sentences)
            )
            merged_text = item.text

            if not indices:
                continue
            filtered_indices: List[int] = []
            has_overlap_with_seen = False
            for idx in indices:
                if idx in seen_indices:
                    has_overlap_with_seen = True
                    break
                filtered_indices.append(idx)
            if has_overlap_with_seen:
                logger.warning(
                    f"   Overlapping source indices in merge group {indices}. IGNORING GROUP."
                )
                continue
            if not filtered_indices:
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
            merged_sentence = self._validate_and_build_sentence(
                source_sents,
                indices=filtered_indices,
                cjk=cjk,
                merged_text=merged_text,
            )
            if merged_sentence is None:
                # Mark these indices as seen to avoid repeated attempts, but keep originals.
                seen_indices.update(filtered_indices)
                new_sentences.extend(source_sents)
                continue

            new_sentences.append(merged_sentence)
            # Mark indices used in this merged sentence as consumed.
            seen_indices.update(filtered_indices)

        # Fallback: append any original sentences that were never referenced
        # in merged_data so that no segments are lost.  Only for core indices.
        for idx in range(core_size):
            if idx not in seen_indices:
                new_sentences.append(batch_sentences[idx])

        return new_sentences

    def _reconstruct_stream_window(
        self,
        batch_sentences: List[Sentence],
        merged_data: List[MergedLine],
        cjk: bool,
        *,
        core_size: int,
    ) -> tuple[List[Sentence], int]:
        """Reconstruct the longest safe prefix for streaming semantic windows."""
        prepared_groups: list[tuple[List[int], str | None]] = []
        seen_indices: Set[int] = set()

        for item in merged_data:
            indices = self._validate_index_group(
                item.source_indices, len(batch_sentences)
            )
            if not indices:
                continue
            if any(idx in seen_indices for idx in indices):
                logger.warning(
                    f"   Overlapping source indices in merge group {indices}. IGNORING GROUP."
                )
                continue
            prepared_groups.append((indices, item.text))
            seen_indices.update(indices)

        emitted: List[Sentence] = []
        retain_from = 0
        group_index = 0

        while retain_from < core_size:
            while (
                group_index < len(prepared_groups)
                and prepared_groups[group_index][0][-1] < retain_from
            ):
                group_index += 1

            if group_index >= len(prepared_groups):
                emitted.extend(batch_sentences[retain_from:core_size])
                retain_from = core_size
                break

            indices, merged_text = prepared_groups[group_index]

            if indices[0] > retain_from:
                emitted.append(batch_sentences[retain_from])
                retain_from += 1
                continue

            if indices[0] < retain_from:
                group_index += 1
                continue

            if indices[-1] >= core_size:
                break

            source_sents = [batch_sentences[idx] for idx in indices]
            merged_sentence = self._validate_and_build_sentence(
                source_sents,
                indices=indices,
                cjk=cjk,
                merged_text=merged_text,
            )
            if merged_sentence is None:
                emitted.extend(source_sents)
            else:
                emitted.append(merged_sentence)

            retain_from = indices[-1] + 1
            group_index += 1

        return emitted, retain_from

    # ------------------------------------------------------------------
    # Response parsing
    # ------------------------------------------------------------------

    def _parse_response(self, response: str) -> List[MergedLine]:
        """Parse JSON list of merge-group objects from LLM response."""
        try:
            clean_resp = response.strip()
            if "```json" in clean_resp:
                clean_resp = clean_resp.split("```json")[1].split("```")[0].strip()
            elif "```" in clean_resp:
                clean_resp = clean_resp.split("```")[1].split("```")[0].strip()

            data = json.loads(clean_resp)
            if isinstance(data, dict):
                if "groups" in data:
                    data = data.get("groups", [])
                elif "source_indices" in data:
                    data = [data]
                else:
                    data = []

            if not isinstance(data, list):
                logger.error(
                    f"   Error parsing merge response: expected list, got {type(data).__name__}"
                )
                return []

            results: List[MergedLine] = []
            for item in data:
                if isinstance(item, dict) and "source_indices" in item:
                    results.append(MergedLine(**item))
            return results
        except Exception as e:
            logger.error(f"   Error parsing merge response: {e}")
            return []
