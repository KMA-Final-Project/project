import json
import re
import ollama
from loguru import logger
from typing import List, Dict, Any, Optional
from src.schemas import ContextAnalysisResult, TranslationStyle, VietnamesePronoun
from .prompts import (
    ANALYSIS_SYSTEM_PROMPT,
    NMT_REFINEMENT_PROMPT,
)


class LLMProvider:
    """
    Wrapper for LLM interactions (Ollama).
    """

    def __init__(self, model_name: str = "qwen2.5:7b-instruct", timeout: int = 120):
        self.model_name = model_name
        self.timeout = timeout
        self._client = ollama.Client(timeout=timeout)
        logger.info(
            f"LLMProvider initialized with model: {self.model_name}, timeout: {timeout}s"
        )

    def analyze_context(
        self, text_samples: List[str], target_lang: str
    ) -> ContextAnalysisResult:
        """
        Sends text samples to LLM to determine style and pronouns.
        """
        logger.info("Sending Analysis Request to LLM...")

        # Prepare Prompt values
        styles_list = ", ".join([e.value for e in TranslationStyle])

        # Dynamic Pronoun Logic
        if target_lang.lower() == "vi":
            pronouns_list = ", ".join([e.value for e in VietnamesePronoun])
            pronoun_instruction = (
                f"For Vietnamese pronouns (Enum: {pronouns_list}):\n"
                '   - "I/You" in a formal speech -> "Tôi / Bạn" or "Tôi / Quý khách".\n'
                '   - "I/You" between friends -> "Mình / Bạn" or "Tao / Mày" (if aggressive/close).\n'
                '   - "I/You" in a romantic context -> "Anh / Em" (Male spk) or "Em / Anh" (Female spk).\n'
                '   - "I/You" in family -> Detect roles (Con/Bố, Mother/Child, etc).\n'
                '   - If unsure or neutral, default to "Tôi / Bạn".'
            )
            pronouns_enum_preview = pronouns_list
        else:
            # Generic/English Logic
            pronoun_instruction = "For pronouns: Identify the relationship (Formal, Friends, Romantic, Family) to guide translation choices if applicable."
            pronouns_enum_preview = "N/A (Not strict for this language)"

        system_msg = ANALYSIS_SYSTEM_PROMPT.format(
            styles=styles_list,
            pronouns=pronouns_enum_preview,
            pronoun_instruction=pronoun_instruction,
        )

        user_msg = f"Text Samples:\n" + "\n".join(text_samples)

        try:
            response = self._client.chat(
                model=self.model_name,
                messages=[
                    {"role": "system", "content": system_msg},
                    {"role": "user", "content": user_msg},
                ],
                format="json",  # Force JSON mode
                options={"temperature": 0.2},  # Low temp for deterministic analysis
            )

            content = response["message"]["content"]
            logger.debug(f"LLM Analysis Response: {content}")

            # Parse JSON
            data = json.loads(content)

            # Convert string values to Enums (handling potential mismatches gracefully?)
            # Pydantic validation will handle this if we pass strict data,
            # but let's assume LLM follows instructions effectively with 'format=json'.

            result = ContextAnalysisResult(**data)
            logger.info(
                f"Analysis Complete: Style={result.detected_style}, Pronouns={result.detected_pronouns}"
            )
            return result

        except Exception as e:
            logger.error(f"LLM Analysis Failed: {e}")
            # Fallback to defaults
            return ContextAnalysisResult(
                detected_style=TranslationStyle.NEUTRAL,
                detected_pronouns=VietnamesePronoun.TOI_BAN,
                summary="Analysis failed. Defaulting to Neutral.",
                keywords=[],
            )

    def _strip_markdown_fences(self, content: str) -> str:
        """Remove markdown code fences (```json ... ``` or ``` ... ```) from LLM output."""
        stripped = re.sub(r"^```(?:json)?\s*\n?", "", content.strip())
        stripped = re.sub(r"\n?```\s*$", "", stripped)
        return stripped.strip()

    def _parse_list_output(
        self, content: str, expected_count: int
    ) -> Optional[List[str]]:
        """
        Robust JSON list parser.
        Handles: Raw List, Dict wrapping list, List of Dicts,
        markdown-fenced JSON, and regex fallback for embedded JSON.
        """
        # Step 1: Strip markdown code fences that some models add
        cleaned = self._strip_markdown_fences(content)

        # Step 2: Try direct JSON parse
        parsed = None
        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError:
            # Step 3: Regex fallback — extract first JSON array or object
            match = re.search(r"(\[.*\]|\{.*\})", cleaned, re.DOTALL)
            if match:
                try:
                    parsed = json.loads(match.group(1))
                except json.JSONDecodeError:
                    pass

        if parsed is None:
            logger.warning(
                f"JSON Decode Failed. Raw content (first 500 chars): "
                f"{content[:500]}"
            )
            return None

        return self._extract_list_from_parsed(parsed)

    def _extract_list_from_parsed(self, parsed: Any) -> Optional[List[str]]:
        """Extract a list of strings from various JSON structures."""
        # Case 1: Direct List
        if isinstance(parsed, list):
            # Check if it's a list of strings
            if all(isinstance(i, str) for i in parsed):
                return parsed
            # Case 1b: List of Dicts (e.g. [{"text": "Tx1"}, {"text": "Tx2"}])
            if all(isinstance(i, dict) for i in parsed) and len(parsed) > 0:
                first_key = list(parsed[0].keys())[0]
                extracted = []
                for item in parsed:
                    extracted.append(str(item.get(first_key, "")))
                return extracted

        # Case 2: Dict wrapping list (e.g. {"translations": [...]})
        if isinstance(parsed, dict):
            # 2a: Value is list
            for key, value in parsed.items():
                if isinstance(value, list) and all(isinstance(i, str) for i in value):
                    return value

            # 2b: Dict of Strings (e.g. {"1": "Text", "2": "Text"})
            if all(isinstance(v, str) for v in parsed.values()):
                keys = list(parsed.keys())
                values = list(parsed.values())
                non_empty_values = [v for v in values if v.strip()]
                non_empty_keys = [k for k in keys if k.strip()]
                # LLM sometimes puts translations as dict keys with empty values
                if not non_empty_values and non_empty_keys:
                    logger.warning(
                        "Parsed Dict of Strings: values are ALL empty, "
                        "keys contain text — using keys as translations."
                    )
                    return keys
                logger.warning("Parsed Dict of Strings. Converting to List.")
                return values

        return None

    def generate(self, prompt: str, system_prompt: str = None) -> str:
        """
        Generic generation method for flexible tasks.
        """
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})

        messages.append({"role": "user", "content": prompt})

        try:
            response = self._client.chat(
                model=self.model_name, messages=messages, options={"temperature": 0.3}
            )
            return response["message"]["content"]
        except Exception as e:
            logger.error(f"LLM Generation Failed: {e}")
            raise e

    # ------------------------------------------------------------------
    # Phase 4: NMT refinement
    # ------------------------------------------------------------------

    def _parse_string_list(self, content: str) -> Optional[List[str]]:
        """Parse a JSON array of strings from LLM output.

        Handles markdown code fences and embedded JSON arrays.
        Returns None on any parse failure.
        """
        cleaned = self._strip_markdown_fences(content)
        try:
            parsed = json.loads(cleaned)
            if isinstance(parsed, list) and all(isinstance(i, str) for i in parsed):
                return parsed
        except json.JSONDecodeError:
            pass
        # Regex fallback: extract first JSON array
        match = re.search(r"\[.*\]", cleaned, re.DOTALL)
        if match:
            try:
                parsed = json.loads(match.group(0))
                if isinstance(parsed, list) and all(isinstance(i, str) for i in parsed):
                    return parsed
            except json.JSONDecodeError:
                pass
        return None

    def refine_batch(
        self,
        sources: List[str],
        nmt_translations: List[str],
        context: ContextAnalysisResult,
        target_lang: str,
    ) -> Optional[List[str]]:
        """Refine NMT translations using LLM context awareness.

        Returns a list of refined translations (same length as *sources*)
        on success, or **None** on any failure. Callers MUST fall back to
        *nmt_translations* when this returns None.
        """
        if len(sources) != len(nmt_translations):
            logger.error(
                f"refine_batch: length mismatch — "
                f"{len(sources)} sources vs {len(nmt_translations)} translations"
            )
            return None

        count = len(sources)

        # Build pronoun section
        if target_lang.lower() == "vi" and context.detected_pronouns:
            pronoun_pair = context.detected_pronouns.value
            parts = pronoun_pair.split(" / ")
            first_p = parts[0] if parts else pronoun_pair
            second_p = parts[1] if len(parts) > 1 else ""
            pronoun_section = (
                f'- Pronouns: STRICTLY use "{pronoun_pair}" '
                f'(I = "{first_p}", You = "{second_p}").'
            )
            pronoun_rule = (
                f'- Vietnamese pronoun enforcement: Every "I" must be "{first_p}" '
                f'and every "You" must be "{second_p}". This is NON-NEGOTIABLE.'
            )
        else:
            pronoun_section = (
                "- Pronouns: Adapt to fit the context and speaker relationships."
            )
            pronoun_rule = "- Adapt pronouns naturally for the target language."

        system_msg = NMT_REFINEMENT_PROMPT.format(
            style=context.detected_style.value,
            summary=context.summary,
            keywords=", ".join(context.keywords) if context.keywords else "(none)",
            pronoun_section=pronoun_section,
            count=count,
            pronoun_rule=pronoun_rule,
        )

        # Build numbered source/draft pairs
        lines = []
        for i, (src, draft) in enumerate(zip(sources, nmt_translations)):
            lines.append(f"[{i}] SOURCE: {src} / DRAFT: {draft}")
        user_msg = "\n".join(lines)

        try:
            raw = self.generate(user_msg, system_prompt=system_msg)
            refined = self._parse_string_list(raw)

            if refined is None:
                logger.warning(
                    "refine_batch: failed to parse LLM output as string list"
                )
                return None

            if len(refined) != count:
                logger.warning(
                    f"refine_batch: count mismatch — "
                    f"expected {count}, got {len(refined)}"
                )
                return None

            return refined

        except Exception as e:
            logger.error(f"refine_batch failed: {e}")
            return None
