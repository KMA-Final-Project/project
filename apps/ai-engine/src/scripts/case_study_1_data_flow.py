from __future__ import annotations

import argparse
import sys
import textwrap
from pathlib import Path

import librosa
import librosa.display
import matplotlib.pyplot as plt
import numpy as np
import soundfile as sf
from loguru import logger
from matplotlib.lines import Line2D
from matplotlib.patches import Patch

from src.core.semantic_merger import SemanticMerger
from src.core.nmt_translator import NMTTranslator
from src.core.smart_aligner import SmartAligner
from src.core.vad_manager import VADManager
from src.schemas import Sentence, VADSegment, Word
from src.scripts.case_study_runtime import apply_case_study_runtime
from src.utils.audio_processor import AudioProcessor

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_MEDIA = PROJECT_ROOT / "test-media" / "demo_audio_5.mp3"
OUTPUT_DIR = PROJECT_ROOT / "outputs" / "case_studies"
PREPARED_DIR = OUTPUT_DIR / "prepared_media"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate qualitative data-flow evidence for the AI subtitle pipeline."
    )
    parser.add_argument(
        "--media",
        type=Path,
        default=DEFAULT_MEDIA,
        help="Path to the source media file.",
    )
    parser.add_argument(
        "--duration",
        type=float,
        default=60.0,
        help="Duration in seconds to analyze from the start of the media.",
    )
    parser.add_argument(
        "--target-lang",
        type=str,
        default="vi",
        help="Target language for the NMT stage.",
    )
    parser.add_argument(
        "--source-lang-hint",
        type=str,
        default="en",
        help="Source-language hint used to pick a lighter Whisper runtime for case-study runs.",
    )
    parser.add_argument(
        "--worker-model-mode",
        type=str,
        choices=("auto", "turbo_only", "full_only"),
        default=None,
        help="Optional override for SmartAligner model residency during the case study.",
    )
    return parser.parse_args()


def configure_logger(log_path: Path):
    logger.remove()

    def _filter(record: dict) -> bool:
        return record["extra"].get("case_study", False) or record["level"].no >= 30

    logger.add(
        sys.stdout,
        colorize=True,
        format="{message}",
        filter=_filter,
    )
    logger.add(
        log_path,
        colorize=False,
        encoding="utf-8",
        format="{time:YYYY-MM-DD HH:mm:ss} | {level} | {message}",
        filter=_filter,
    )
    return logger.bind(case_study=True)


def log_case(case_logger, message: str) -> None:
    case_logger.opt(colors=True).info(message)


def ensure_output_dirs() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    PREPARED_DIR.mkdir(parents=True, exist_ok=True)


def prepare_audio_excerpt(
    media_path: Path,
    duration_seconds: float,
    case_logger,
) -> tuple[Path, float]:
    if duration_seconds <= 0:
        raise ValueError("--duration must be greater than 0 seconds")
    if not media_path.exists():
        raise FileNotFoundError(f"Media file not found: {media_path}")

    processor = AudioProcessor(output_dir=PREPARED_DIR)
    processed = processor.process(media_path)
    actual_duration = min(duration_seconds, processed.duration)

    audio, sample_rate = librosa.load(
        str(processed.path),
        sr=AudioProcessor.SAMPLE_RATE,
        mono=True,
        duration=actual_duration,
    )
    excerpt_path = (
        PREPARED_DIR / f"{media_path.stem}_{int(round(actual_duration))}s_excerpt.wav"
    )
    sf.write(excerpt_path, audio, sample_rate)

    log_case(
        case_logger, "<bold><blue>=== Case Study 1: Luong Du Lieu ===</blue></bold>"
    )
    log_case(
        case_logger,
        "<cyan>[SETUP]</cyan> "
        f"Media: <white>{media_path.name}</white> | "
        f"Dang phan tich <white>{actual_duration:.1f}s</white> dau tien | "
        f"Excerpt da chuan bi: <white>{excerpt_path.name}</white>",
    )

    return excerpt_path, actual_duration


def render_waveform_plot(
    audio_array: np.ndarray,
    sample_rate: int,
    segments: list[VADSegment],
    duration_seconds: float,
    output_path: Path,
) -> None:
    plt.style.use("seaborn-v0_8-whitegrid")
    figure, axis = plt.subplots(figsize=(15, 5), dpi=180)

    librosa.display.waveshow(
        audio_array,
        sr=sample_rate,
        ax=axis,
        color="#1f4e79",
        alpha=0.85,
    )

    for index, segment in enumerate(segments):
        axis.axvspan(
            segment.start,
            segment.end,
            color="#f4a261",
            alpha=0.24,
            label="VAD speech region" if index == 0 else None,
        )

    axis.set_title(
        f"Waveform with Voice Activity Detection (First {duration_seconds:.1f} Seconds)",
        fontsize=14,
    )
    axis.set_xlabel("Time (seconds)")
    axis.set_ylabel("Amplitude")
    axis.set_facecolor("#fbfbfb")

    legend_handles = [
        Line2D([0], [0], color="#1f4e79", linewidth=2, label="Waveform"),
        Patch(
            facecolor="#f4a261",
            edgecolor="#f4a261",
            alpha=0.24,
            label="VAD speech region",
        ),
    ]
    axis.legend(handles=legend_handles, loc="upper right", frameon=True)

    figure.tight_layout()
    figure.savefig(output_path, bbox_inches="tight")
    plt.close(figure)


# def preview_text(text: str, limit: int = 92) -> str:
#     return textwrap.shorten(" ".join(text.split()), width=limit, placeholder="...")


def preview_words(words: list[Word], limit: int = 8) -> str:
    entries = [
        f"{word.word}({word.start:.2f}-{word.end:.2f})" for word in words[:limit]
    ]
    return ", ".join(entries)


def log_preview_window(
    case_logger,
    label: str,
    total_items: int,
    limit: int,
) -> None:
    shown = min(total_items, limit)
    if total_items <= limit:
        message = f"{label} | hien thi tat ca {total_items} muc"
    else:
        remaining = total_items - shown
        message = (
            f"{label} | hien thi {shown} / {total_items} muc dau tien | "
            f"con_lai={remaining}"
        )
    log_case(case_logger, f"<dim>{message}</dim>")


def log_vad_segments(case_logger, segments: list[VADSegment], limit: int = 3) -> None:
    log_preview_window(case_logger, "[VAD_PREVIEW]", len(segments), limit)
    for index, segment in enumerate(segments[:limit]):
        log_case(
            case_logger,
            "<bold><yellow>[VAD_CUT]</yellow></bold> "
            f"Segment {index:02d} | {segment.start:6.2f}s -> {segment.end:6.2f}s | "
            f"thoi_luong={segment.duration:5.2f}s | loai={segment.type.value}",
        )


def log_aligner_output(case_logger, sentences: list[Sentence], limit: int = 3) -> None:
    log_preview_window(case_logger, "[TRANSCRIPT_PREVIEW]", len(sentences), limit)
    for index, sentence in enumerate(sentences[:limit]):
        log_case(
            case_logger,
            "<bold><magenta>[WHISPER_TRANSCRIPT]</magenta></bold> "
            f"Sentence {index:02d} | {sentence.start:6.2f}s -> {sentence.end:6.2f}s | "
            # f"text=\"{preview_text(sentence.text)}\""
            f'text="{sentence.text}"',
        )
        log_case(
            case_logger,
            "<magenta>    words:</magenta> " f"{preview_words(sentence.words)}",
        )


def log_merged_output(
    case_logger, merged_groups: list[list[Sentence]], limit: int = 3
) -> None:
    total_sentences = sum(len(group) for group in merged_groups)
    log_preview_window(case_logger, "[MERGE_PREVIEW]", total_sentences, limit)
    shown = 0
    for group_index, group in enumerate(merged_groups):
        for sentence in group:
            log_case(
                case_logger,
                "<bold><cyan>[SEMANTIC_MERGED]</cyan></bold> "
                f"Batch {group_index:02d} | {sentence.start:6.2f}s -> {sentence.end:6.2f}s | "
                f'text="{sentence.text}"',
            )
            shown += 1
            if shown >= limit:
                return


def log_translations(
    case_logger,
    translated_sentences: list[Sentence],
    limit: int = 3,
) -> None:
    log_preview_window(
        case_logger,
        "[TRANSLATION_PREVIEW]",
        len(translated_sentences),
        limit,
    )
    for index, sentence in enumerate(translated_sentences[:limit]):
        log_case(
            case_logger,
            "<bold><green>[NMT_TRANSLATED]</green></bold> "
            f"Muc {index:02d} | {sentence.start:6.2f}s -> {sentence.end:6.2f}s | "
            f'source="{sentence.text}" | '
            f'target="{sentence.translation}"',
        )


def main() -> None:
    args = parse_args()
    ensure_output_dirs()

    log_path = OUTPUT_DIR / "case_study_1_data_flow.log"
    plot_path = OUTPUT_DIR / "waveform_vad_case_study.png"
    case_logger = configure_logger(log_path)

    runtime = apply_case_study_runtime(
        source_lang_hint=args.source_lang_hint,
        worker_model_mode=args.worker_model_mode,
    )

    excerpt_path, actual_duration = prepare_audio_excerpt(
        args.media, args.duration, case_logger
    )

    log_case(
        case_logger,
        "<cyan>[RUNTIME_MODE]</cyan> "
        f"source_lang_hint=<white>{runtime.source_lang_hint}</white> | "
        f"worker_model_mode=<white>{runtime.worker_model_mode}</white> | "
        f"merge_provider=<white>{runtime.merge_provider}</white> | "
        f"remote_fallback=<white>{runtime.remote_fallback_enabled}</white>",
    )

    vad_manager = VADManager()
    aligner = SmartAligner()
    merger = SemanticMerger()

    log_case(
        case_logger,
        "<cyan>[MERGE_MODE]</cyan> "
        "Case-study semantic merge dung local Ollama SemanticMerger va tri hoan "
        "tai NMT den sau buoc merge.",
    )

    vad_segments, _vad_input_path, audio_array = vad_manager.process(
        excerpt_path, profile="standard"
    )
    if not vad_segments:
        raise RuntimeError("VAD did not detect any speech in the selected excerpt")

    render_waveform_plot(
        audio_array,
        AudioProcessor.SAMPLE_RATE,
        vad_segments,
        actual_duration,
        plot_path,
    )
    log_case(
        case_logger,
        "<cyan>[PLOT_SAVED]</cyan> "
        f"Da ghi hinh Waveform + VAD vao <white>{plot_path}</white>",
    )
    log_vad_segments(case_logger, vad_segments)

    aligned_sentences = aligner.process(
        excerpt_path,
        vad_segments,
        profile="standard",
        chunk_size=8,
        audio_array=audio_array,
    )
    if not aligned_sentences:
        raise RuntimeError("SmartAligner returned no transcript sentences")

    log_aligner_output(case_logger, aligned_sentences)

    source_lang = next(
        (
            sentence.detected_lang
            for sentence in aligned_sentences
            if sentence.detected_lang
        ),
        "en",
    )
    merged_groups = merger.process(
        aligned_sentences,
        source_lang=source_lang,
        context_style="Speech/Dialogue",
    )
    flattened_merged = [sentence for group in merged_groups for sentence in group]
    if not flattened_merged:
        flattened_merged = list(aligned_sentences)

    log_case(
        case_logger,
        "<cyan>[MERGE_SUMMARY]</cyan> "
        f"source_lang={source_lang} | raw_sentences={len(aligned_sentences)} | "
        f"merged_sentences={len(flattened_merged)} | groups={len(merged_groups)}",
    )
    log_merged_output(case_logger, merged_groups)

    translatable_batch = next(
        (group for group in merged_groups if group), flattened_merged[:4]
    )
    if source_lang == args.target_lang:
        translations = [sentence.text for sentence in translatable_batch]
    else:
        translator = NMTTranslator.get_instance()
        translations = translator.translate_batch(
            [sentence.text for sentence in translatable_batch],
            source_lang,
            args.target_lang,
        )

    translated_preview: list[Sentence] = []
    for sentence, translation in zip(translatable_batch, translations):
        translated_preview.append(
            sentence.model_copy(update={"translation": translation})
        )

    log_translations(case_logger, translated_preview)
    log_case(
        case_logger,
        "<bold><blue>=== Hoan tat ===</blue></bold> "
        f"Da xu ly {actual_duration:.1f}s | plot=<white>{plot_path.name}</white> | "
        f"log=<white>{log_path.name}</white>",
    )


if __name__ == "__main__":
    main()
