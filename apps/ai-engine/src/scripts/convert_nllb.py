"""
One-time helper script to convert the HuggingFace NLLB-200-3.3B model
to CTranslate2 format for fast inference.

Usage:
    cd apps/ai-engine
    python -m src.scripts.convert_nllb                    # default: int8_float16
    python -m src.scripts.convert_nllb --quantization float16

Pre-requisites (install once before running):
    pip install transformers[torch] sentencepiece protobuf
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

from loguru import logger
from src.config import settings


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert NLLB-200-3.3B to CTranslate2 format",
    )
    parser.add_argument(
        "--model",
        type=str,
        default=settings.NMT_TOKENIZER_NAME,
        help="HuggingFace model name (default: %(default)s)",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=settings.NMT_MODEL_DIR,
        help="Output directory for the converted model (default: %(default)s)",
    )
    parser.add_argument(
        "--quantization",
        type=str,
        default=settings.NMT_COMPUTE_TYPE,
        choices=["int8_float16", "float16", "int8", "float32"],
        help="Quantization type (default: %(default)s)",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    converter_path = shutil.which("ct2-transformers-converter")
    if converter_path is None:
        logger.error(
            "ct2-transformers-converter not found on PATH. "
            "Make sure ctranslate2 is installed (comes with faster-whisper)."
        )
        sys.exit(1)

    output_dir: Path = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    cmd: list[str] = [
        "ct2-transformers-converter",
        "--model",
        args.model,
        "--output_dir",
        str(output_dir),
        "--quantization",
        args.quantization,
        "--force",
    ]

    logger.info("Starting NLLB model conversion")
    logger.info(f"  Model      : {args.model}")
    logger.info(f"  Output dir : {output_dir.resolve()}")
    logger.info(f"  Quantization: {args.quantization}")
    logger.info(f"  Command    : {' '.join(cmd)}")

    result = subprocess.run(cmd, check=False)

    if result.returncode != 0:
        logger.error(f"Conversion failed with return code {result.returncode}")
        sys.exit(result.returncode)

    # Print final model size
    total_bytes: int = sum(
        f.stat().st_size for f in output_dir.rglob("*") if f.is_file()
    )
    size_gb: float = total_bytes / (1024**3)
    logger.success(f"Conversion complete! Model size: {size_gb:.2f} GB")
    logger.success(f"Model saved to: {output_dir.resolve()}")


if __name__ == "__main__":
    main()
