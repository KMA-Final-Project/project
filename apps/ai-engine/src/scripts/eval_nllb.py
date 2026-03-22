"""
Phase 0 — NLLB-200 Translation Quality & Performance Evaluation

Loads the CTranslate2-converted NLLB model and translates test sentences
across all required language pairs, printing results for human evaluation.

Usage:
    cd apps/ai-engine
    python -m src.scripts.eval_nllb
    python -m src.scripts.eval_nllb --model-dir temp/models/nllb-200-3.3B-ct2
    python -m src.scripts.eval_nllb --compare-fp16   # compare INT8 vs FP16
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import ctranslate2
import torch
from loguru import logger
from transformers import AutoTokenizer

from src.config import settings

# ---------------------------------------------------------------------------
# NLLB language code mapping
# ---------------------------------------------------------------------------
NLLB_LANG_MAP: dict[str, str] = {
    "en": "eng_Latn",
    "vi": "vie_Latn",
    "zh": "zho_Hans",
}

LANG_NAMES: dict[str, str] = {
    "en": "English",
    "vi": "Vietnamese",
    "zh": "Chinese",
}

# ---------------------------------------------------------------------------
# Language pairs to evaluate
# ---------------------------------------------------------------------------
LANGUAGE_PAIRS: list[tuple[str, str]] = [
    ("en", "vi"),
    ("en", "zh"),
    ("zh", "vi"),
    ("zh", "en"),
]

# ---------------------------------------------------------------------------
# Edge-case test sentences
# ---------------------------------------------------------------------------
EDGE_CASES_EN: list[str] = [
    # Short fragment
    "So what's going on here?",
    # Very long sentence
    "It turns out that we're fighting one of the most evolutionarily conserved "
    "learning processes currently known in science, one that's conserved back to "
    "the most basic nervous systems known to man.",
    # Technical vocabulary
    "The prefrontal cortex, which is responsible for executive function and "
    "decision making, essentially goes offline when we get stressed.",
    # Casual/conversational
    "Yeah I mean honestly it's not that big of a deal, you know what I'm saying?",
    # Numbers and proper nouns
    "In 2024, OpenAI released GPT-4 Turbo with a 128,000 token context window.",
]

EDGE_CASES_ZH: list[str] = [
    # Simple daily Chinese
    "今天天气很好，我们去公园散步吧。",
    # Technical Chinese
    "深度学习模型需要大量的训练数据和强大的计算资源。",
    # Formal Chinese
    "各位来宾，欢迎参加本次国际学术研讨会。",
    # Conversational Chinese
    "哎你说的这个事情我觉得不太靠谱啊。",
    # Mixed Chinese with English terms
    "这个API的response time太长了，需要优化一下backend的代码。",
]

# ---------------------------------------------------------------------------
# Real sentences from debug output
# ---------------------------------------------------------------------------
BATCH_JSON_PATH: Path = (
    settings.BASE_DIR
    / "outputs"
    / "debug"
    / "d422b74d-e5a3-40fc-af98-9f4472ce9aee"
    / "batch_001.json"
)


def load_real_sentences(path: Path, max_count: int = 15) -> list[str]:
    """Load the first *max_count* raw_input sentences from a debug batch file."""
    if not path.exists():
        logger.warning(f"Batch file not found: {path} — skipping real sentences")
        return []
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    raw: list[dict[str, object]] = data.get("raw_input", [])
    return [str(item["text"]).strip() for item in raw[:max_count]]


# ---------------------------------------------------------------------------
# Translator wrapper
# ---------------------------------------------------------------------------


class NLLBEvaluator:
    """Thin wrapper around CTranslate2 + HuggingFace tokenizer for evaluation."""

    def __init__(self, model_dir: Path, compute_type: str) -> None:
        logger.info(f"Loading CTranslate2 model from {model_dir} ({compute_type})")
        # Some GPU architectures (e.g. Blackwell/Ada) do not support int8_float16.
        # Fall back through a safe chain until one works.
        fallback_chain: list[str] = [compute_type, "float16", "int8", "default"]
        seen: set[str] = set()
        self.translator: ctranslate2.Translator | None = None
        for ct in fallback_chain:
            if ct in seen:
                continue
            seen.add(ct)
            try:
                self.translator = ctranslate2.Translator(
                    str(model_dir),
                    device="cuda",
                    compute_type=ct,
                )
                if ct != compute_type:
                    logger.warning(
                        f"compute_type '{compute_type}' not supported on this GPU — "
                        f"fell back to '{ct}'"
                    )
                compute_type = ct
                break
            except ValueError as exc:
                logger.warning(f"compute_type '{ct}' rejected ({exc}), trying next…")
        if self.translator is None:
            raise RuntimeError(
                "No supported compute_type found for this GPU/CTranslate2 build."
            )
        self.tokenizer = AutoTokenizer.from_pretrained(
            settings.NMT_TOKENIZER_NAME,
        )
        self.compute_type = compute_type

        vram_bytes: int = torch.cuda.memory_allocated()
        vram_mb: float = vram_bytes / (1024**2)
        logger.info(f"VRAM after model load: {vram_mb:.1f} MB")

    def translate_batch(
        self,
        texts: list[str],
        source_lang: str,
        target_lang: str,
        beam_size: int = settings.NMT_BEAM_SIZE,
    ) -> list[str]:
        """Translate a batch of sentences, returning translated strings."""
        src_code: str = NLLB_LANG_MAP[source_lang]
        tgt_code: str = NLLB_LANG_MAP[target_lang]

        # Tokenize with HuggingFace tokenizer
        self.tokenizer.src_lang = src_code
        tokenized: list[list[str]] = [
            self.tokenizer.convert_ids_to_tokens(self.tokenizer.encode(text))
            for text in texts
        ]

        # Target prefix for NLLB
        target_prefix: list[list[str]] = [[tgt_code]] * len(texts)

        # CTranslate2 batch translate
        results = self.translator.translate_batch(
            tokenized,
            target_prefix=target_prefix,
            beam_size=beam_size,
        )

        assert len(results) == len(
            texts
        ), f"1:1 mapping broken: {len(results)} results for {len(texts)} inputs"

        # Decode results
        decoded: list[str] = []
        for result in results:
            tokens: list[str] = result.hypotheses[0][1:]  # skip language token
            text: str = self.tokenizer.decode(
                self.tokenizer.convert_tokens_to_ids(tokens),
            )
            decoded.append(text)
        return decoded


# ---------------------------------------------------------------------------
# Evaluation helpers
# ---------------------------------------------------------------------------


def print_translations(
    evaluator: NLLBEvaluator,
    sentences: list[str],
    source_lang: str,
    target_lang: str,
    label: str,
) -> float:
    """Translate and print results. Returns elapsed seconds."""
    src_name: str = LANG_NAMES[source_lang]
    tgt_name: str = LANG_NAMES[target_lang]
    header: str = (
        f"=== {source_lang.upper()} → {target_lang.upper()} ({src_name} to {tgt_name}) — {label} ==="
    )
    print(f"\n{header}")

    start: float = time.perf_counter()
    translations: list[str] = evaluator.translate_batch(
        sentences,
        source_lang,
        target_lang,
    )
    elapsed: float = time.perf_counter() - start

    for idx, (src, tgt) in enumerate(zip(sentences, translations), start=1):
        print(f"[{idx:02d}] SRC: {src}")
        print(f"     NMT: {tgt}")
        print()

    count: int = len(sentences)
    ms_per_sent: float = (elapsed / count) * 1000 if count else 0
    sents_per_sec: float = count / elapsed if elapsed > 0 else 0
    print(
        f"  ⏱  {count} sentences | {elapsed:.2f}s total | "
        f"{ms_per_sent:.1f} ms/sent | {sents_per_sec:.1f} sent/s"
    )
    return elapsed


def run_batch_size_benchmark(
    evaluator: NLLBEvaluator,
    sentences: list[str],
    source_lang: str,
    target_lang: str,
) -> None:
    """Benchmark different batch sizes to find the sweet spot."""
    print(f"\n{'=' * 60}")
    print(f"  BATCH SIZE BENCHMARK  ({source_lang.upper()} → {target_lang.upper()})")
    print(f"{'=' * 60}")

    batch_sizes: list[int] = [1, 4, 8, 16]
    # Use up to 16 sentences for the benchmark
    test_sents: list[str] = (
        (sentences * 2)[:16] if len(sentences) < 16 else sentences[:16]
    )

    for bs in batch_sizes:
        total_time: float = 0.0
        total_sents: int = 0
        for i in range(0, len(test_sents), bs):
            batch: list[str] = test_sents[i : i + bs]
            start: float = time.perf_counter()
            evaluator.translate_batch(batch, source_lang, target_lang)
            total_time += time.perf_counter() - start
            total_sents += len(batch)

        ms_per_sent: float = (total_time / total_sents) * 1000 if total_sents else 0
        sents_per_sec: float = total_sents / total_time if total_time > 0 else 0
        print(
            f"  batch_size={bs:2d} | {total_sents} sents | "
            f"{total_time:.2f}s total | {ms_per_sent:.1f} ms/sent | "
            f"{sents_per_sec:.1f} sent/s"
        )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Evaluate NLLB-200 translation quality via CTranslate2",
    )
    parser.add_argument(
        "--model-dir",
        type=Path,
        default=settings.NMT_MODEL_DIR,
        help="CTranslate2 model directory (default: %(default)s)",
    )
    parser.add_argument(
        "--compute-type",
        type=str,
        default=settings.NMT_COMPUTE_TYPE,
        help="CTranslate2 compute type (default: %(default)s)",
    )
    parser.add_argument(
        "--compare-fp16",
        action="store_true",
        help="Also load FP16 model and compare with INT8",
    )
    parser.add_argument(
        "--fp16-model-dir",
        type=Path,
        default=None,
        help="FP16 model directory (default: <model-dir>/../nllb-200-3.3B-ct2-fp16)",
    )
    return parser.parse_args()


def run_full_evaluation(evaluator: NLLBEvaluator, label: str = "") -> None:
    """Run translation evaluation across all language pairs."""
    # Load real sentences
    real_en_sentences: list[str] = load_real_sentences(BATCH_JSON_PATH, max_count=15)

    # Build sentence sets per source language
    en_sentences: list[str] = real_en_sentences + EDGE_CASES_EN
    zh_sentences: list[str] = EDGE_CASES_ZH

    for src_lang, tgt_lang in LANGUAGE_PAIRS:
        if src_lang == "en":
            sentences = en_sentences
        elif src_lang == "zh":
            sentences = zh_sentences
        else:
            logger.warning(
                f"No test sentences for source language '{src_lang}', skipping"
            )
            continue

        print_translations(evaluator, sentences, src_lang, tgt_lang, label=label)

    # Batch size benchmark on EN→VI (primary use case)
    if en_sentences:
        run_batch_size_benchmark(evaluator, en_sentences, "en", "vi")


def main() -> None:
    args = parse_args()

    model_dir: Path = args.model_dir
    if not model_dir.exists():
        logger.error(
            f"Model directory not found: {model_dir.resolve()}\n"
            "Run the conversion first:\n"
            "  python -m src.scripts.convert_nllb"
        )
        return

    print("=" * 70)
    print("  NLLB-200 Translation Quality Evaluation — Phase 0")
    print("=" * 70)

    # Primary evaluation
    evaluator = NLLBEvaluator(model_dir, args.compute_type)
    run_full_evaluation(evaluator, label=f"primary ({args.compute_type})")

    # Optional FP16 comparison
    if args.compare_fp16:
        fp16_dir: Path = args.fp16_model_dir or (
            model_dir.parent / "nllb-200-3.3B-ct2-fp16"
        )
        if not fp16_dir.exists():
            logger.warning(
                f"FP16 model directory not found: {fp16_dir}\n"
                "Convert with: python -m src.scripts.convert_nllb --quantization float16 "
                f"--output-dir {fp16_dir}"
            )
        else:
            # Unload INT8 model to free VRAM
            del evaluator
            torch.cuda.empty_cache()

            print("\n" + "=" * 70)
            print("  FP16 COMPARISON")
            print("=" * 70)
            evaluator_fp16 = NLLBEvaluator(fp16_dir, "float16")
            run_full_evaluation(evaluator_fp16, label="comparison (float16)")

    print("\n" + "=" * 70)
    print("  Evaluation complete. Review translations above for go/no-go decision.")
    print("=" * 70)


if __name__ == "__main__":
    main()
