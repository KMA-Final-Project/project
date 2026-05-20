"""Local benchmark runner for the V2 AI engine pipeline.

Runs the core path without BullMQ, database writes, or MinIO uploads so timing
comparisons stay focused on VAD, alignment, merge, and NMT work.

Usage:
    python -m src.scripts.benchmark path/to/audio.wav --target-lang vi
"""

from __future__ import annotations

import argparse
import asyncio
import json
import time
from pathlib import Path
from typing import Any

from loguru import logger

from src.config import settings
from src.core.nmt_translator import NMTTranslator
from src.core.pipeline import PipelineOrchestrator
from src.schemas import Sentence

_CJK_LANGUAGES: frozenset[str] = frozenset({"zh", "ja", "ko", "yue"})


def _is_cjk(lang: str) -> bool:
    return lang.lower().split("-")[0] in _CJK_LANGUAGES


def _detect_source_language(sentences: list[Sentence]) -> str:
    if not sentences:
        return "en"
    if sentences[0].detected_lang:
        return sentences[0].detected_lang

    sample = " ".join(sentence.text for sentence in sentences[:5])
    cjk_count = sum(1 for char in sample if "\u4e00" <= char <= "\u9fff")
    if cjk_count > len(sample) * 0.3:
        return "zh"

    vietnamese_chars = set(
        "ăâđêôơưàảãáạằẳẵắặầẩẫấậèẻẽéẹềểễếệìỉĩíịòỏõóọồổỗốộờởỡớợùủũúụừửữứựỳỷỹýỵ"
    )
    vietnamese_count = sum(1 for char in sample.lower() if char in vietnamese_chars)
    if vietnamese_count > len(sample) * 0.05:
        return "vi"
    return "en"


def _sentence_length(sentence: Sentence) -> int:
    text = sentence.text.strip()
    if not text:
        return 0
    return len(text) if any("\u4e00" <= char <= "\u9fff" for char in text) else len(text.split())


async def run_benchmark(audio_path: Path, target_lang: str) -> dict[str, Any]:
    pipeline = PipelineOrchestrator()
    timings: dict[str, float] = {}
    total_started_at = time.perf_counter()

    audio_prep_started_at = time.perf_counter()
    audio_meta = await asyncio.to_thread(pipeline.audio_processor.process, audio_path)
    standardized_path = audio_meta.path
    timings["audio_prep_s"] = time.perf_counter() - audio_prep_started_at

    inspect_started_at = time.perf_counter()
    profile = await asyncio.to_thread(pipeline.audio_inspector.inspect, standardized_path)
    timings["inspect_s"] = time.perf_counter() - inspect_started_at

    vad_started_at = time.perf_counter()
    segments, clean_audio_path, audio_array = await asyncio.to_thread(
        pipeline.vad_manager.process,
        standardized_path,
        profile=profile,
    )
    timings["vad_s"] = time.perf_counter() - vad_started_at

    if not segments:
        return {
            "audio_path": str(audio_path),
            "profile": profile,
            "source_lang": "",
            "target_lang": target_lang,
            "sentence_count": 0,
            "avg_sentence_length": 0.0,
            "stages": {key: round(value, 3) for key, value in timings.items()},
            "total_s": round(time.perf_counter() - total_started_at, 3),
        }

    aligner_started_at = time.perf_counter()
    aligned_sentences = await asyncio.to_thread(
        pipeline.aligner.process,
        clean_audio_path,
        segments,
        profile=profile,
        chunk_size=settings.CHUNK_SIZE,
        audio_array=audio_array,
    )
    timings["smart_aligner_s"] = time.perf_counter() - aligner_started_at

    source_lang = _detect_source_language(aligned_sentences)
    final_sentences = list(aligned_sentences)
    context_style = "Song/Music Lyrics" if profile == "music" else "Speech/Dialogue"

    merge_started_at = time.perf_counter()
    if _is_cjk(source_lang) and len(final_sentences) > 3 and pipeline.merger.needs_merge(
        final_sentences,
        source_lang,
    ):
        merged_groups = await asyncio.to_thread(
            pipeline.merger.process,
            final_sentences,
            source_lang=source_lang,
            context_style=context_style,
        )
        final_sentences = [sentence for group in merged_groups for sentence in group]
    timings["merge_s"] = time.perf_counter() - merge_started_at

    nmt_started_at = time.perf_counter()
    if final_sentences and source_lang != target_lang:
        translator = await asyncio.to_thread(NMTTranslator.get_instance)
        translations = await asyncio.to_thread(
            translator.translate_batch,
            [sentence.text for sentence in final_sentences],
            source_lang,
            target_lang,
        )
        for sentence, translation in zip(final_sentences, translations):
            sentence.translation = translation
    timings["nmt_s"] = time.perf_counter() - nmt_started_at

    avg_sentence_length = (
        sum(_sentence_length(sentence) for sentence in final_sentences)
        / len(final_sentences)
        if final_sentences
        else 0.0
    )

    result = {
        "audio_path": str(audio_path),
        "profile": profile,
        "source_lang": source_lang,
        "target_lang": target_lang,
        "sentence_count": len(final_sentences),
        "avg_sentence_length": round(avg_sentence_length, 2),
        "stages": {
            **{key: round(value, 3) for key, value in timings.items()},
            **{
                f"aligner_{key}_s": value
                for key, value in getattr(pipeline.aligner, "last_timing", {}).items()
            },
        },
        "total_s": round(time.perf_counter() - total_started_at, 3),
    }
    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Benchmark the local AI engine pipeline")
    parser.add_argument("audio_path", type=Path, help="Path to the input audio/video file")
    parser.add_argument(
        "--target-lang",
        default="vi",
        help="Target language for translation benchmarking",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Optional path to write the JSON benchmark report",
    )
    return parser.parse_args()


async def _main() -> None:
    args = parse_args()
    audio_path: Path = args.audio_path.resolve()
    if not audio_path.exists():
        raise FileNotFoundError(f"Input file not found: {audio_path}")

    result = await run_benchmark(audio_path, args.target_lang)
    output_path = args.output or (
        settings.OUTPUT_DIR / "benchmarks" / f"{audio_path.stem}.benchmark.json"
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")

    logger.info(json.dumps(result, indent=2, ensure_ascii=False))
    logger.success(f"Benchmark report written to {output_path}")


if __name__ == "__main__":
    asyncio.run(_main())