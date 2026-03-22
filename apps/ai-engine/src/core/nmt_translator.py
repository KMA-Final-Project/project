"""
NMTTranslator — V2 Neural Machine Translation Engine
=====================================================
Production-ready singleton that replaces LLM-based translation for the V2 pipeline.

Uses the NLLB-200-3.3B model converted to CTranslate2 format (same runtime as
faster-whisper). Key guarantees:
  - Deterministic 1:1 input/output mapping (one sentence in → one translation out)
  - No JSON parsing, no regex fallback — plain text output
  - ~50-100 ms/sentence on GPU (vs ~2-4 s for qwen2.5:7b-instruct)
  - INT8/FP16 quantization with automatic GPU fallback chain

Ollama/LLM is intentionally NOT used here — NMT handles translation.
LLM remains responsible for: context analysis, CJK homophone correction,
semantic merging, and context-aware post-processing.
"""

from __future__ import annotations

import ctranslate2
import torch
from loguru import logger
from transformers import AutoTokenizer

from src.config import settings

# ---------------------------------------------------------------------------
# NLLB-200 / Flores-200 language code map
# ---------------------------------------------------------------------------
NLLB_LANG_MAP: dict[str, str] = {
    "en": "eng_Latn",
    "vi": "vie_Latn",
    "zh": "zho_Hans",
    "zh-tw": "zho_Hant",
    "zh-cn": "zho_Hans",
    "ja": "jpn_Jpan",
    "ko": "kor_Hang",
}


class NMTTranslator:
    """
    Singleton NMT translator backed by NLLB-200-3.3B via CTranslate2.

    Usage:
        nmt = NMTTranslator.get_instance()
        result = nmt.translate("Hello.", "en", "vi")
        results = nmt.translate_batch(["Hello.", "Bye."], "en", "vi")
    """

    _instance: "NMTTranslator | None" = None

    @classmethod
    def get_instance(cls) -> "NMTTranslator":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def __init__(self) -> None:
        preferred: str = settings.NMT_COMPUTE_TYPE
        fallback_chain: list[str] = [preferred, "float16", "int8", "default"]
        seen: set[str] = set()

        self.translator: ctranslate2.Translator | None = None
        actual_compute_type: str = preferred

        for ct in fallback_chain:
            if ct in seen:
                continue
            seen.add(ct)
            try:
                self.translator = ctranslate2.Translator(
                    str(settings.NMT_MODEL_DIR),
                    device=settings.DEVICE,
                    device_index=settings.DEVICE_INDEX,
                    compute_type=ct,
                )
                if ct != preferred:
                    logger.warning(
                        f"NMTTranslator: compute_type '{preferred}' not supported "
                        f"on this GPU — fell back to '{ct}'"
                    )
                actual_compute_type = ct
                break
            except ValueError as exc:
                logger.warning(
                    f"NMTTranslator: compute_type '{ct}' rejected ({exc}), trying next…"
                )

        if self.translator is None:
            raise RuntimeError(
                "NMTTranslator: no supported compute_type found for this GPU/CTranslate2 build. "
                f"Tried: {fallback_chain}"
            )

        # Tokenizer loads only JSON files (~1 MB), no model weights, no GPU allocation.
        logger.info(
            f"NMTTranslator: loading tokenizer '{settings.NMT_TOKENIZER_NAME}' (CPU-only)"
        )
        self.tokenizer: AutoTokenizer = AutoTokenizer.from_pretrained(
            settings.NMT_TOKENIZER_NAME
        )
        self.compute_type: str = actual_compute_type

        if settings.DEVICE == "cuda":
            vram_bytes: int = torch.cuda.memory_allocated()
            vram_mb: float = vram_bytes / (1024**2)
            logger.info(
                f"NMTTranslator ready — compute_type={actual_compute_type}, "
                f"VRAM used: {vram_mb:.1f} MB"
            )
        else:
            logger.info(
                f"NMTTranslator ready — compute_type={actual_compute_type}, device={settings.DEVICE}"
            )

    # ------------------------------------------------------------------
    # Core translation methods
    # ------------------------------------------------------------------

    def translate_batch(
        self,
        texts: list[str],
        source_lang: str,
        target_lang: str,
    ) -> list[str]:
        """
        Translate a batch of sentences. Guaranteed 1:1 mapping with input.

        Args:
            texts: Source sentences to translate.
            source_lang: ISO code, e.g. "en", "zh", "vi".
            target_lang: ISO code, e.g. "vi", "en".

        Returns:
            List of translated strings, same length as *texts*.
        """
        if not texts:
            return []

        if source_lang not in NLLB_LANG_MAP:
            logger.warning(
                f"NMTTranslator: source_lang '{source_lang}' not in NLLB_LANG_MAP — "
                "using raw string as language token"
            )
        if target_lang not in NLLB_LANG_MAP:
            logger.warning(
                f"NMTTranslator: target_lang '{target_lang}' not in NLLB_LANG_MAP — "
                "using raw string as language token"
            )

        src_code: str = NLLB_LANG_MAP.get(source_lang, source_lang)
        tgt_code: str = NLLB_LANG_MAP.get(target_lang, target_lang)

        # Tokenize with HuggingFace tokenizer (CPU)
        self.tokenizer.src_lang = src_code
        tokenized: list[list[str]] = [
            self.tokenizer.convert_ids_to_tokens(self.tokenizer.encode(text))
            for text in texts
        ]

        # Build target prefix — NLLB requires the target language token as first token
        target_prefix: list[list[str]] = [[tgt_code]] * len(texts)

        # CTranslate2 batch translate
        results = self.translator.translate_batch(
            tokenized,
            target_prefix=target_prefix,
            beam_size=settings.NMT_BEAM_SIZE,
        )

        assert len(results) == len(texts), (
            f"NMTTranslator: 1:1 mapping broken — "
            f"got {len(results)} results for {len(texts)} inputs"
        )

        # Decode: skip index [0] which is the leading language token
        decoded: list[str] = []
        for result in results:
            tokens: list[str] = result.hypotheses[0][1:]
            text: str = self.tokenizer.decode(
                self.tokenizer.convert_tokens_to_ids(tokens)
            )
            decoded.append(text)

        return decoded

    def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        """Convenience wrapper — translate a single sentence."""
        return self.translate_batch([text], source_lang, target_lang)[0]

    def supported_languages(self) -> list[str]:
        """Return the list of supported language codes (keys of NLLB_LANG_MAP)."""
        return list(NLLB_LANG_MAP.keys())
