from __future__ import annotations

import argparse
import asyncio
import importlib
import sys
import textwrap
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import librosa
import soundfile as sf
from loguru import logger

from src.scripts.case_study_runtime import apply_case_study_runtime
from src.utils.audio_processor import AudioProcessor

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_MEDIA = PROJECT_ROOT / "test-media" / "demo_audio_5.mp3"
OUTPUT_DIR = PROJECT_ROOT / "outputs" / "case_studies"
PREPARED_DIR = OUTPUT_DIR / "prepared_media"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate streaming timeline evidence from the active V2 async pipeline."
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
        help="Target language for the translation stage.",
    )
    parser.add_argument(
        "--chunk-size",
        type=int,
        default=1,
        help="Report-mode SmartAligner chunk size override for earlier Tier 1 emission.",
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
        PREPARED_DIR
        / f"{media_path.stem}_{int(round(actual_duration))}s_streaming_excerpt.wav"
    )
    sf.write(excerpt_path, audio, sample_rate)

    log_case(
        case_logger,
        "<bold><blue>=== Case Study 2: Moc Thoi Gian Streaming ===</blue></bold>",
    )
    log_case(
        case_logger,
        "<cyan>[SETUP]</cyan> "
        f"Media: <white>{media_path.name}</white> | "
        f"Dang phan tich <white>{actual_duration:.1f}s</white> dau tien | "
        f"Excerpt da chuan bi: <white>{excerpt_path.name}</white>",
    )
    return excerpt_path, actual_duration


def preview_text(text: str, limit: int = 500) -> str:
    return textwrap.shorten(" ".join(text.split()), width=limit, placeholder="...")


def format_elapsed(elapsed_seconds: float) -> str:
    minutes = int(elapsed_seconds // 60)
    seconds = elapsed_seconds - (minutes * 60)
    return f"[{minutes:02d}:{seconds:05.2f}]"


@dataclass
class ChunkRecord:
    chunk_index: int
    start: float
    end: float
    text: str
    emitted_at: float | None = None


@dataclass
class BatchRecord:
    batch_index: int
    first_segment_index: int
    start: float
    end: float
    text: str
    emitted_at: float | None = None


class TimelineMinioClient:
    def __init__(self) -> None:
        self.chunk_records: dict[int, ChunkRecord] = {}
        self.batch_records: dict[int, BatchRecord] = {}

    def upload_chunk(self, media_id: str, chunk_index: int, data: list[dict[str, Any]]):
        start = float(data[0]["start"]) if data else 0.0
        end = float(data[-1]["end"]) if data else 0.0
        text = preview_text(" ".join(item["text"] for item in data))
        self.chunk_records[chunk_index] = ChunkRecord(
            chunk_index=chunk_index,
            start=start,
            end=end,
            text=text,
        )
        object_key = f"{media_id}/chunks/{chunk_index}.json"
        return object_key, f"http://timeline.local/{object_key}"

    def upload_translated_batch(self, media_id: str, batch):
        payload = batch.model_dump()
        segments = payload["segments"]
        start = float(segments[0]["start"]) if segments else 0.0
        end = float(segments[-1]["end"]) if segments else 0.0
        text = preview_text(
            " ".join(segment["translation"] or segment["text"] for segment in segments)
        )
        self.batch_records[payload["batch_index"]] = BatchRecord(
            batch_index=payload["batch_index"],
            first_segment_index=payload["first_segment_index"],
            start=start,
            end=end,
            text=text,
        )
        object_key = f"{media_id}/translated_batches/{payload['batch_index']}.json"
        return object_key, f"http://timeline.local/{object_key}"

    def upload_final_result(self, media_id: str, output):
        object_key = f"{media_id}/final.json"
        return object_key, f"http://timeline.local/{object_key}"


class TimelineRecorder:
    def __init__(
        self, case_logger, wall_started_at: float, audio_duration: float
    ) -> None:
        self.case_logger = case_logger
        self.wall_started_at = wall_started_at
        self.audio_duration = audio_duration

    def elapsed(self) -> float:
        return time.perf_counter() - self.wall_started_at

    def log_start(self) -> None:
        log_case(
            self.case_logger,
            f"<green>{format_elapsed(0.0)}</green> "
            f"<bold><cyan>🚀 Bat dau xu ly</cyan></bold> "
            f"<white>(thoi_luong audio: {self.audio_duration:.1f}s)</white>",
        )

    def log_chunk(self, record: ChunkRecord) -> None:
        elapsed = self.elapsed()
        record.emitted_at = elapsed
        log_case(
            self.case_logger,
            f"<green>{format_elapsed(elapsed)}</green> "
            f"<bold><cyan>📦 [Tier 1 Chunk {record.chunk_index}]</cyan></bold> "
            f'Da phat ra - Text: "{record.text}" '
            f"(Audio TS: {record.start:.1f}s - {record.end:.1f}s)",
        )

    def log_batch(
        self, record: BatchRecord, reference_chunk: ChunkRecord | None
    ) -> None:
        elapsed = self.elapsed()
        record.emitted_at = elapsed
        if reference_chunk is not None and reference_chunk.emitted_at is not None:
            delta_text = f"+{elapsed - reference_chunk.emitted_at:.2f}s"
        else:
            delta_text = "n/a"
        log_case(
            self.case_logger,
            f"<green>{format_elapsed(elapsed)}</green> "
            f"<bold><magenta>🌍 [Tier 2 Batch {record.batch_index}]</magenta></bold> "
            f'Da dich - Text: "{record.text}" '
            f"(Audio TS: {record.start:.1f}s - {record.end:.1f}s | Delta tu Chunk: {delta_text})",
        )

    def log_complete(self, segment_count: int) -> None:
        elapsed = self.elapsed()
        playback_margin = self.audio_duration - elapsed
        if playback_margin >= 0:
            pace_text = f"som hon playback {playback_margin:.2f}s"
        else:
            pace_text = f"cham hon playback {abs(playback_margin):.2f}s"
        log_case(
            self.case_logger,
            f"<green>{format_elapsed(elapsed)}</green> "
            f"<bold><blue>✅ Hoan tat</blue></bold> "
            f"Da xuat {segment_count} segments tu {self.audio_duration:.1f}s audio; {pace_text}",
        )


def find_reference_chunk(
    chunk_records: dict[int, ChunkRecord],
    batch_record: BatchRecord,
) -> ChunkRecord | None:
    candidates = [
        record for record in chunk_records.values() if record.emitted_at is not None
    ]
    if not candidates:
        return None
    overlapping = [
        record
        for record in candidates
        if record.start <= batch_record.start <= record.end
        or batch_record.start <= record.start <= batch_record.end
    ]
    if overlapping:
        return min(
            overlapping, key=lambda record: abs(record.start - batch_record.start)
        )
    return min(candidates, key=lambda record: abs(record.start - batch_record.start))


async def run_pipeline(
    excerpt_path: Path,
    duration_seconds: float,
    target_lang: str,
    chunk_size: int,
    source_lang_hint: str,
    worker_model_mode: str | None,
    case_logger,
) -> None:
    async_mod = importlib.import_module("src.async_pipeline")
    pipeline_mod = importlib.import_module("src.core.pipeline")
    nmt_mod = importlib.import_module("src.core.nmt_translator")

    media_id = f"case-study-2-{int(time.time())}"
    user_id = "case-study"
    debug_trace: list[dict[str, Any]] = []

    minio_client = TimelineMinioClient()

    def _fake_update_media_status(*args, **kwargs) -> None:
        return None

    def _fake_publish_progress(*args, **kwargs) -> None:
        return None

    def _fake_publish_chunk_ready(
        *,
        media_id: str,
        user_id: str,
        chunk_index: int,
        url: str,
        sentence_count: int,
    ) -> None:
        record = minio_client.chunk_records.get(chunk_index)
        if record is not None:
            recorder.log_chunk(record)

    def _fake_publish_batch_ready(
        *,
        media_id: str,
        user_id: str,
        batch_index: int,
        url: str,
        segment_count: int,
        progress: float,
    ) -> None:
        record = minio_client.batch_records.get(batch_index)
        if record is None:
            return
        reference_chunk = find_reference_chunk(minio_client.chunk_records, record)
        recorder.log_batch(record, reference_chunk)

    original_update = async_mod.update_media_status
    original_progress = async_mod.publish_progress
    original_chunk_ready = async_mod.publish_chunk_ready
    original_batch_ready = async_mod.publish_batch_ready
    original_refinement = async_mod.settings.AI_ENABLE_LLM_REFINEMENT

    async_mod.update_media_status = _fake_update_media_status
    async_mod.publish_progress = _fake_publish_progress
    async_mod.publish_chunk_ready = _fake_publish_chunk_ready
    async_mod.publish_batch_ready = _fake_publish_batch_ready
    async_mod.settings.AI_ENABLE_LLM_REFINEMENT = False

    try:
        runtime = apply_case_study_runtime(
            source_lang_hint=source_lang_hint,
            worker_model_mode=worker_model_mode,
        )
        log_case(
            case_logger,
            "<cyan>[RUNTIME_MODE]</cyan> "
            f"source_lang_hint=<white>{runtime.source_lang_hint}</white> | "
            f"worker_model_mode=<white>{runtime.worker_model_mode}</white> | "
            f"merge_provider=<white>{runtime.merge_provider}</white> | "
            f"remote_fallback=<white>{runtime.remote_fallback_enabled}</white>",
        )
        log_case(
            case_logger,
            f"<cyan>[PREWARM]</cyan> Dang tai truoc cac worker components truoc khi bat dau dem thoi gian (chunk_size={chunk_size})",
        )
        pipeline = pipeline_mod.PipelineOrchestrator()
        log_case(
            case_logger,
            "<cyan>[MERGE_MODE]</cyan> "
            "Case-study streaming dung local Ollama SemanticMerger voi NMT "
            "prefetch duoc tri hoan.",
        )
        original_aligner_process: Callable[..., Any] = pipeline.aligner.process

        def _report_aligner_process(
            file_path: Path,
            segments,
            profile: str = "standard",
            on_chunk=None,
            chunk_size: int = 20,
            audio_array=None,
        ):
            return original_aligner_process(
                file_path,
                segments,
                profile=profile,
                on_chunk=on_chunk,
                chunk_size=max(1, chunk_size_override),
                audio_array=audio_array,
            )

        chunk_size_override = max(1, chunk_size)
        pipeline.aligner.process = _report_aligner_process

        wall_started_at = time.perf_counter()
        recorder = TimelineRecorder(case_logger, wall_started_at, duration_seconds)
        recorder.log_start()
        output = await async_mod.run_v2_pipeline_async(
            pipeline,
            minio_client,
            excerpt_path,
            media_id,
            user_id=user_id,
            started_at=time.time(),
            target_lang=target_lang,
            duration_seconds=duration_seconds,
            debug_trace=debug_trace,
            prefetch_nmt=False,
        )
    finally:
        async_mod.update_media_status = original_update
        async_mod.publish_progress = original_progress
        async_mod.publish_chunk_ready = original_chunk_ready
        async_mod.publish_batch_ready = original_batch_ready
        async_mod.settings.AI_ENABLE_LLM_REFINEMENT = original_refinement

    recorder.log_complete(len(output.segments))
    if debug_trace:
        pipeline_completed = next(
            (item for item in debug_trace if item.get("event") == "pipeline_completed"),
            None,
        )
        if pipeline_completed is not None:
            log_case(
                case_logger,
                "<cyan>[TRACE]</cyan> "
                f"pipeline_completed tai {pipeline_completed['t']:.2f}s | "
                f"segments={pipeline_completed.get('segment_count', len(output.segments))}",
            )


def main() -> None:
    args = parse_args()
    ensure_output_dirs()

    log_path = OUTPUT_DIR / "case_study_2_streaming_timeline.log"
    case_logger = configure_logger(log_path)
    excerpt_path, actual_duration = prepare_audio_excerpt(
        args.media, args.duration, case_logger
    )

    asyncio.run(
        run_pipeline(
            excerpt_path=excerpt_path,
            duration_seconds=actual_duration,
            target_lang=args.target_lang,
            chunk_size=args.chunk_size,
            source_lang_hint=args.source_lang_hint,
            worker_model_mode=args.worker_model_mode,
            case_logger=case_logger,
        )
    )
    log_case(
        case_logger,
        f"<bold><blue>=== Hoan tat ===</blue></bold> log=<white>{log_path.name}</white>",
    )


if __name__ == "__main__":
    main()
