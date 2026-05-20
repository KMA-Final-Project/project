from __future__ import annotations

import json
import re
from typing import Any, List, Optional

import ollama
from loguru import logger

from src.config import settings
from src.schemas import ContextAnalysisResult, TranslationStyle, VietnamesePronoun

from .prompts import ANALYSIS_SYSTEM_PROMPT, NMT_REFINEMENT_PROMPT

SUPPORTED_PROVIDERS = {"ollama", "openai", "gemini"}

MERGE_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "groups": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "text": {"type": ["string", "null"]},
                    "source_indices": {
                        "type": "array",
                        "items": {"type": "integer"},
                        "minItems": 1,
                    },
                },
                "required": ["source_indices"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["groups"],
    "additionalProperties": False,
}

REFINEMENT_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "translations": {
            "type": "array",
            "items": {"type": "string"},
        }
    },
    "required": ["translations"],
    "additionalProperties": False,
}

ANALYSIS_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "detected_style": {
            "type": "string",
            "enum": [style.value for style in TranslationStyle],
        },
        "detected_pronouns": {
            "type": "string",
            "enum": [pronoun.value for pronoun in VietnamesePronoun],
        },
        "summary": {"type": "string"},
        "keywords": {
            "type": "array",
            "items": {"type": "string"},
        },
    },
    "required": ["detected_style", "detected_pronouns", "summary", "keywords"],
    "additionalProperties": False,
}


class LLMProvider:
    """
    Capability-aware LLM wrapper with remote providers and Ollama fallback.
    """

    def __init__(self, model_name: str | None = None, timeout: int | None = None):
        self.model_name = model_name
        self.timeout = timeout or settings.OLLAMA_TIMEOUT_SECONDS
        client_kwargs: dict[str, Any] = {"timeout": self.timeout}
        if settings.OLLAMA_HOST:
            client_kwargs["host"] = settings.OLLAMA_HOST
        self._ollama_client = ollama.Client(**client_kwargs)
        logger.info(
            "LLMProvider initialized | providers={} | ollama_timeout={}s".format(
                ", ".join(sorted(SUPPORTED_PROVIDERS)),
                self.timeout,
            )
        )

    def _provider_model(self, provider: str, capability: str) -> str:
        if provider == "ollama" and self.model_name:
            return self.model_name
        return settings.llm_model_for(provider, capability)

    def _temperature_for(self, capability: str) -> float:
        capability_name = settings.normalize_llm_capability(capability)
        if capability_name == "analysis":
            return 0.2
        if capability_name == "refinement":
            return 0.2
        return 0.1

    def _normalize_provider(self, provider: str) -> str:
        normalized = provider.strip().lower()
        if normalized not in SUPPORTED_PROVIDERS:
            raise ValueError(f"Unsupported LLM provider: {provider}")
        return normalized

    def _load_openai_client(self):
        if not settings.OPENAI_API_KEY:
            raise RuntimeError("OPENAI_API_KEY is not configured")
        try:
            from openai import OpenAI
        except ImportError as exc:
            raise RuntimeError(
                "The openai package is required for OpenAI LLM usage"
            ) from exc

        client_kwargs: dict[str, Any] = {"api_key": settings.OPENAI_API_KEY}
        if settings.OPENAI_BASE_URL:
            client_kwargs["base_url"] = settings.OPENAI_BASE_URL
        return OpenAI(**client_kwargs)

    def _load_gemini_client(self):
        if not settings.GEMINI_API_KEY:
            raise RuntimeError("GEMINI_API_KEY is not configured")
        try:
            from google import genai
        except ImportError as exc:
            raise RuntimeError(
                "The google-genai package is required for Gemini LLM usage"
            ) from exc
        return genai.Client(api_key=settings.GEMINI_API_KEY)

    def _ollama_options(
        self, capability: str, *, use_cpu: bool = False
    ) -> dict[str, Any]:
        options: dict[str, Any] = {
            "temperature": self._temperature_for(capability),
            "num_ctx": settings.ollama_num_ctx_for(capability),
        }
        if use_cpu:
            options["num_gpu"] = 0
        return options

    def _coerce_response_text(self, content: Any) -> str:
        if content is None:
            return ""
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts: list[str] = []
            for item in content:
                if isinstance(item, dict):
                    text = item.get("text")
                    if text:
                        parts.append(str(text))
                else:
                    parts.append(str(item))
            return "\n".join(parts)
        return str(content)

    def _maybe_unwrap_json(self, raw_text: str, unwrap_key: str | None) -> str:
        if not unwrap_key:
            return raw_text
        try:
            parsed = json.loads(raw_text)
        except json.JSONDecodeError:
            return raw_text

        if isinstance(parsed, dict) and unwrap_key in parsed:
            return json.dumps(parsed[unwrap_key], ensure_ascii=False)
        return raw_text

    def _generate_with_ollama(
        self,
        capability: str,
        prompt: str,
        system_prompt: str | None,
        response_schema: dict[str, Any] | None,
        unwrap_key: str | None,
    ) -> str:
        messages: list[dict[str, str]] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        model = self._provider_model("ollama", capability)
        base_kwargs: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "options": self._ollama_options(capability),
        }
        if response_schema is not None:
            base_kwargs["format"] = "json"

        try:
            response = self._ollama_client.chat(**base_kwargs)
            text = response["message"]["content"]
            return self._maybe_unwrap_json(text, unwrap_key)
        except Exception as exc:
            if not settings.OLLAMA_CPU_FALLBACK_ON_ERROR:
                raise exc

            logger.warning(
                "Ollama {} failed on default runtime, retrying on CPU: {}",
                capability,
                exc,
            )
            cpu_kwargs = dict(base_kwargs)
            cpu_kwargs["options"] = self._ollama_options(capability, use_cpu=True)
            response = self._ollama_client.chat(**cpu_kwargs)
            text = response["message"]["content"]
            return self._maybe_unwrap_json(text, unwrap_key)

    def _generate_with_openai(
        self,
        capability: str,
        prompt: str,
        system_prompt: str | None,
        response_schema: dict[str, Any] | None,
        response_schema_name: str | None,
        unwrap_key: str | None,
    ) -> str:
        client = self._load_openai_client()
        messages: list[dict[str, str]] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        kwargs: dict[str, Any] = {
            "model": self._provider_model("openai", capability),
            "messages": messages,
            "temperature": self._temperature_for(capability),
        }
        if response_schema is not None:
            kwargs["response_format"] = {
                "type": "json_schema",
                "json_schema": {
                    "name": response_schema_name or f"{capability}_response",
                    "strict": True,
                    "schema": response_schema,
                },
            }

        completion = client.chat.completions.create(**kwargs)
        text = self._coerce_response_text(completion.choices[0].message.content)
        return self._maybe_unwrap_json(text, unwrap_key)

    def _generate_with_gemini(
        self,
        capability: str,
        prompt: str,
        system_prompt: str | None,
        response_schema: dict[str, Any] | None,
        unwrap_key: str | None,
    ) -> str:
        client = self._load_gemini_client()
        config: dict[str, Any] = {
            "temperature": self._temperature_for(capability),
        }
        if system_prompt:
            config["system_instruction"] = system_prompt
        if response_schema is not None:
            config["response_mime_type"] = "application/json"
            config["response_json_schema"] = response_schema

        response = client.models.generate_content(
            model=self._provider_model("gemini", capability),
            contents=prompt,
            config=config,
        )
        text = self._coerce_response_text(response.text)
        return self._maybe_unwrap_json(text, unwrap_key)

    def _generate_with_provider(
        self,
        provider: str,
        capability: str,
        prompt: str,
        system_prompt: str | None,
        response_schema: dict[str, Any] | None,
        response_schema_name: str | None,
        unwrap_key: str | None,
    ) -> str:
        provider_name = self._normalize_provider(provider)
        if provider_name == "ollama":
            return self._generate_with_ollama(
                capability,
                prompt,
                system_prompt,
                response_schema,
                unwrap_key,
            )
        if provider_name == "openai":
            return self._generate_with_openai(
                capability,
                prompt,
                system_prompt,
                response_schema,
                response_schema_name,
                unwrap_key,
            )
        return self._generate_with_gemini(
            capability,
            prompt,
            system_prompt,
            response_schema,
            unwrap_key,
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
            content = self.generate(
                user_msg,
                system_prompt=system_msg,
                capability="analysis",
                response_schema=ANALYSIS_RESPONSE_SCHEMA,
                response_schema_name="context_analysis",
            )
            logger.debug(f"LLM Analysis Response: {content}")

            data = json.loads(content)
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

    def generate(
        self,
        prompt: str,
        system_prompt: str | None = None,
        *,
        capability: str = "merge",
        response_schema: dict[str, Any] | None = None,
        response_schema_name: str | None = None,
        unwrap_key: str | None = None,
    ) -> str:
        """
        Generic generation method with provider routing and optional structured output.
        """
        capability_name = settings.normalize_llm_capability(capability)
        schema = response_schema
        schema_name = response_schema_name
        unwrap = unwrap_key

        if schema is None and capability_name == "merger":
            schema = MERGE_RESPONSE_SCHEMA
            schema_name = "semantic_merge_groups"
            unwrap = "groups"

        primary_provider = settings.llm_provider_for(capability_name)

        try:
            return self._generate_with_provider(
                primary_provider,
                capability_name,
                prompt,
                system_prompt,
                schema,
                schema_name,
                unwrap,
            )
        except Exception as e:
            if primary_provider != "ollama" and settings.LLM_REMOTE_TO_OLLAMA_FALLBACK:
                logger.warning(
                    "{} via {} failed, retrying with Ollama fallback: {}",
                    capability_name,
                    primary_provider,
                    e,
                )
                return self._generate_with_provider(
                    "ollama",
                    capability_name,
                    prompt,
                    system_prompt,
                    schema,
                    schema_name,
                    unwrap,
                )
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
            raw = self.generate(
                user_msg,
                system_prompt=system_msg,
                capability="refinement",
                response_schema=REFINEMENT_RESPONSE_SCHEMA,
                response_schema_name="nmt_refinement",
                unwrap_key="translations",
            )
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
