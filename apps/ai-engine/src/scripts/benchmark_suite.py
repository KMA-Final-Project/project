"""Benchmark suite for the local AI engine processing pipeline.

Runs the real V2 async processing path directly against the YouTube cases listed
in `apps/ai-engine/test_medias.md`. Each case is downloaded as audio-only into
`apps/ai-engine/benchmark/audios` when needed, then benchmarked with
infrastructure side effects disabled. No Redis notifications, DB status writes,
or MinIO uploads are used for the benchmark run itself.

Outputs:
  - Per-case subtitle JSON files (kept separate from reports)
  - Per-case JSON metrics files
  - Per-case Markdown reports
  - Per-case hardware profiler TXT/CSV files
  - Suite-level JSON + Markdown summary

Usage:
    python -m src.scripts.benchmark_suite
    python -m src.scripts.benchmark_suite --list-cases
    python -m src.scripts.benchmark_suite --case english_01_-moW9jvvMr4
"""

from __future__ import annotations

import argparse
import asyncio
import json
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

import ffmpeg
from loguru import logger
from yt_dlp import YoutubeDL

from src import async_pipeline as processing_pipeline
from src.config import settings
from src.core.pipeline import PipelineOrchestrator
from src.scripts.benchmark_manifest import (
    BenchmarkCase,
    TEST_MEDIA_URLS_BY_FAMILY,
    load_benchmark_cases,
)
from src.utils.hardware_profiler import HardwareProfiler, ProfileReport

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
BENCHMARK_AUDIO_DIR = PROJECT_ROOT / "benchmark" / "audios"
OUTPUT_ROOT = PROJECT_ROOT / settings.OUTPUT_DIR / "benchmarks"
AUDIO_DOWNLOAD_EXTENSION = "mp3"


class ProcessingOnlyMinioClient:
    """Bookkeeping-only stand-in for the async pipeline's streaming hooks.

    The async V2 pipeline expects chunk and translated-batch upload methods.
    For benchmark mode we keep those calls in-process, but they only update
    counters and return synthetic object keys without doing any I/O.
    """

    def __init__(self) -> None:
        self.chunk_count: int = 0
        self.batch_count: int = 0
        self.chunk_sentence_total: int = 0
        self.batch_segment_total: int = 0

    def upload_chunk(
        self,
        media_id: str,
        chunk_index: int,
        data: list[dict[str, Any]],
    ) -> tuple[str, str]:
        self.chunk_count += 1
        self.chunk_sentence_total += len(data)
        object_key = f"{media_id}/chunks/{chunk_index}.json"
        return object_key, f"processing-only://{object_key}"

    def upload_translated_batch(
        self,
        media_id: str,
        batch: Any,
    ) -> tuple[str, str]:
        self.batch_count += 1
        self.batch_segment_total += len(batch.segments)
        object_key = f"{media_id}/translated_batches/{batch.batch_index}.json"
        return object_key, f"processing-only://{object_key}"


def _prepare_processing_only_runtime() -> None:
    """Disable infra callbacks inside the async pipeline module."""

    def _noop(*args: Any, **kwargs: Any) -> None:
        return None

    processing_pipeline.update_media_status = _noop
    processing_pipeline.publish_progress = _noop
    processing_pipeline.publish_chunk_ready = _noop
    processing_pipeline.publish_batch_ready = _noop


def _find_case(case_id: str, benchmark_cases: Iterable[BenchmarkCase]) -> BenchmarkCase:
    available_cases = list(benchmark_cases)
    for case in available_cases:
        if case.case_id == case_id:
            return case
    available_case_ids = ", ".join(case.case_id for case in available_cases)
    raise KeyError(
        f"Unknown benchmark case: {case_id}. Available cases: {available_case_ids}"
    )


def _selected_cases(
    case_ids: list[str] | None,
    benchmark_cases: tuple[BenchmarkCase, ...],
) -> list[BenchmarkCase]:
    if not case_ids:
        return list(benchmark_cases)
    return [_find_case(case_id, benchmark_cases) for case_id in case_ids]


def _probe_duration_seconds(audio_path: Path) -> float:
    probe = ffmpeg.probe(str(audio_path))
    duration_str = probe.get("format", {}).get("duration")
    if duration_str:
        return float(duration_str)

    for stream in probe.get("streams", []):
        stream_duration = stream.get("duration")
        if stream_duration:
            return float(stream_duration)

    raise RuntimeError(f"Could not determine duration for {audio_path}")


def _file_size_mb(audio_path: Path) -> float:
    return round(audio_path.stat().st_size / (1024 * 1024), 2)


def _case_audio_path(case: BenchmarkCase) -> Path:
    return BENCHMARK_AUDIO_DIR / f"{case.case_id}.{AUDIO_DOWNLOAD_EXTENSION}"


def _legacy_case_audio_path(case: BenchmarkCase) -> Path | None:
    video_id = case.case_id.split("_", 1)[1]
    matches = sorted(
        BENCHMARK_AUDIO_DIR.glob(
            f"{case.source_family}_*_{video_id}.{AUDIO_DOWNLOAD_EXTENSION}"
        )
    )
    return matches[0] if matches else None


def _download_audio_fixture(
    case: BenchmarkCase,
) -> tuple[Path, str | None, bool, float]:
    BENCHMARK_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    audio_path = _case_audio_path(case)
    if audio_path.exists():
        logger.info(
            f"Using cached benchmark audio for {case.case_id}: {audio_path.name}"
        )
        return audio_path, None, True, 0.0

    legacy_audio_path = _legacy_case_audio_path(case)
    if legacy_audio_path is not None and legacy_audio_path.exists():
        legacy_audio_path.replace(audio_path)
        logger.info(
            f"Migrated cached benchmark audio for {case.case_id}: {legacy_audio_path.name} -> {audio_path.name}"
        )
        return audio_path, None, True, 0.0

    download_started_at = time.perf_counter()
    logger.info(
        f"Downloading benchmark audio for {case.case_id} from {case.source_url}"
    )
    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": str(BENCHMARK_AUDIO_DIR / f"{case.case_id}.%(ext)s"),
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        # The default web client is currently tripping YouTube bot checks in this environment.
        "extractor_args": {"youtube": {"player_client": ["android"]}},
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": AUDIO_DOWNLOAD_EXTENSION,
                "preferredquality": "192",
            }
        ],
    }

    with YoutubeDL(ydl_opts) as downloader:
        info = downloader.extract_info(case.source_url, download=True)

    if not audio_path.exists():
        raise FileNotFoundError(
            f"Downloaded benchmark audio is missing for {case.case_id}: {audio_path}"
        )

    download_s = round(time.perf_counter() - download_started_at, 3)
    return audio_path, info.get("title"), False, download_s


def _trace_time(
    trace: list[dict[str, Any]], event: str, *, last: bool = False
) -> float | None:
    matches = [entry["t"] for entry in trace if entry.get("event") == event]
    if not matches:
        return None
    return matches[-1] if last else matches[0]


def _round_or_none(value: float | None, digits: int = 3) -> float | None:
    if value is None:
        return None
    return round(value, digits)


def _compute_stage_metrics(
    trace: list[dict[str, Any]],
    run_metrics: dict[str, Any],
    wall_clock_s: float,
) -> dict[str, float | None]:
    audio_prep_done = _trace_time(trace, "audio_prep_done")
    inspect_done = _trace_time(trace, "inspect_done")
    vad_done = _trace_time(trace, "vad_done")
    first_chunk = _trace_time(trace, "chunk_uploaded")
    first_batch = _trace_time(trace, "batch_uploaded")
    last_batch = _trace_time(trace, "batch_uploaded", last=True)
    pipeline_done = _trace_time(trace, "pipeline_completed")

    pipeline_total = float(run_metrics.get("pipeline_total", wall_clock_s))
    completed_at = pipeline_done if pipeline_done is not None else pipeline_total

    def delta(end: float | None, start: float | None) -> float | None:
        if end is None or start is None:
            return None
        return max(0.0, end - start)

    return {
        "audio_prep_s": _round_or_none(audio_prep_done),
        "inspect_s": _round_or_none(delta(inspect_done, audio_prep_done)),
        "vad_s": _round_or_none(delta(vad_done, inspect_done)),
        "time_to_first_chunk_s": _round_or_none(first_chunk),
        "time_to_first_translated_batch_s": _round_or_none(first_batch),
        "first_batch_after_first_chunk_s": _round_or_none(
            delta(first_batch, first_chunk)
        ),
        "translated_batches_visible_window_s": _round_or_none(
            delta(completed_at, first_batch)
        ),
        "finalization_after_last_batch_s": _round_or_none(
            delta(completed_at, last_batch)
        ),
        "pipeline_completed_at_s": _round_or_none(completed_at),
        "wall_clock_total_s": round(wall_clock_s, 3),
    }


def _streaming_metrics(
    processing_client: ProcessingOnlyMinioClient,
    final_segment_total: int,
) -> dict[str, Any]:
    return {
        "chunk_count": processing_client.chunk_count,
        "batch_count": processing_client.batch_count,
        "chunk_sentence_total": processing_client.chunk_sentence_total,
        "batch_segment_total": processing_client.batch_segment_total,
        "final_segment_total": final_segment_total,
        "final_output_count": 1 if final_segment_total >= 0 else 0,
    }


def _output_metrics(output: Any) -> dict[str, Any]:
    segments = list(output.segments)
    segment_count = len(segments)
    total_word_count = sum(len(segment.words) for segment in segments)
    total_segment_duration = sum(
        max(0.0, segment.end - segment.start) for segment in segments
    )
    translation_filled = sum(1 for segment in segments if segment.translation.strip())
    phonetic_filled = sum(1 for segment in segments if segment.phonetic.strip())

    return {
        "segment_count": segment_count,
        "word_count_total": total_word_count,
        "avg_words_per_segment": (
            round(total_word_count / segment_count, 2) if segment_count else 0.0
        ),
        "avg_segment_duration_s": (
            round(total_segment_duration / segment_count, 3) if segment_count else 0.0
        ),
        "translation_filled_segments": translation_filled,
        "phonetic_filled_segments": phonetic_filled,
    }


def _hardware_metrics(report: ProfileReport | None) -> dict[str, Any] | None:
    if report is None:
        return None
    return {
        "duration_seconds": report.duration_seconds,
        "sample_count": report.sample_count,
        "avg_cpu": report.avg_cpu,
        "max_cpu": report.max_cpu,
        "avg_ram_gb": report.avg_ram_gb,
        "max_ram_gb": report.max_ram_gb,
        "avg_gpu_util": report.avg_gpu_util,
        "max_gpu_util": report.max_gpu_util,
        "avg_gpu_mem_mb": report.avg_gpu_mem_mb,
        "max_gpu_mem_mb": report.max_gpu_mem_mb,
        "gpu_mem_total_mb": report.gpu_mem_total_mb,
        "avg_gpu_temp": report.avg_gpu_temp,
        "max_gpu_temp": report.max_gpu_temp,
        "avg_gpu_power": report.avg_gpu_power,
        "max_gpu_power": report.max_gpu_power,
    }


def _suite_case_table_rows(case_results: Iterable[dict[str, Any]]) -> list[str]:
    rows = [
        "| Case | Status | Source | Provider | Route | Policy | Prefetch | Duration (s) | Wall Clock (s) | RTF | First Chunk (s) | First Batch (s) | Segments | Profile | Model |",
        "| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |",
    ]
    for result in case_results:
        metrics = result.get("metrics", {})
        runtime = metrics.get("runtime", {})
        detected = metrics.get("detected", {})
        output_stats = metrics.get("output", {})
        rows.append(
            "| {case_id} | {status} | {source} | {provider} | {route} | {policy} | {prefetch} | {duration} | {wall_clock} | {rtf} | {first_chunk} | {first_batch} | {segments} | {profile} | {model} |".format(
                case_id=result["case_id"],
                status=result["status"],
                source=detected.get("source_lang", result["source_family"]),
                provider=detected.get("asr_provider", "-"),
                route=detected.get("route", "-"),
                policy=detected.get("translation_start_policy", "-"),
                prefetch="yes" if detected.get("nmt_prefetch_used") else "no",
                duration=runtime.get("audio_duration_s", "-"),
                wall_clock=runtime.get("wall_clock_s", "-"),
                rtf=runtime.get("real_time_factor", "-"),
                first_chunk=metrics.get("stages", {}).get("time_to_first_chunk_s", "-"),
                first_batch=metrics.get("stages", {}).get(
                    "time_to_first_translated_batch_s", "-"
                ),
                segments=output_stats.get("segment_count", "-"),
                profile=detected.get("profile", "-"),
                model=detected.get("model_used", "-"),
            )
        )
    return rows


def _family_averages(
    case_results: Iterable[dict[str, Any]],
) -> dict[str, dict[str, float]]:
    grouped: dict[str, dict[str, list[float]]] = {}
    for result in case_results:
        if result["status"] != "completed":
            continue
        family = result["source_family"]
        metrics = result["metrics"]
        grouped.setdefault(
            family,
            {
                "wall_clock_s": [],
                "real_time_factor": [],
                "first_chunk_s": [],
                "first_batch_s": [],
                "segments": [],
                "consumer_merge_s": [],
                "consumer_nmt_s": [],
            },
        )
        grouped[family]["wall_clock_s"].append(
            float(metrics["runtime"]["wall_clock_s"])
        )
        grouped[family]["real_time_factor"].append(
            float(metrics["runtime"]["real_time_factor"])
        )
        first_chunk = metrics["stages"].get("time_to_first_chunk_s")
        if first_chunk is not None:
            grouped[family]["first_chunk_s"].append(float(first_chunk))
        first_batch = metrics["stages"].get("time_to_first_translated_batch_s")
        if first_batch is not None:
            grouped[family]["first_batch_s"].append(float(first_batch))
        grouped[family]["segments"].append(float(metrics["output"]["segment_count"]))
        consumer = metrics["pipeline_last_run_metrics"].get("consumer", {})
        grouped[family]["consumer_merge_s"].append(float(consumer.get("merge", 0.0)))
        grouped[family]["consumer_nmt_s"].append(float(consumer.get("nmt", 0.0)))

    averages: dict[str, dict[str, float]] = {}
    for family, values in grouped.items():
        averages[family] = {}
        for metric_name, metric_values in values.items():
            if not metric_values:
                continue
            averages[family][metric_name] = round(
                sum(metric_values) / len(metric_values), 3
            )
    return averages


def _render_case_markdown(case_result: dict[str, Any]) -> str:
    metrics = case_result["metrics"]
    runtime = metrics["runtime"]
    stages = metrics["stages"]
    detected = metrics["detected"]
    output_stats = metrics["output"]
    streaming = metrics["streaming"]
    hardware = metrics.get("hardware") or {}
    trace = metrics["trace"]

    lines = [
        f"# {case_result['label']}",
        "",
        "## Case",
        f"- Case ID: {case_result['case_id']}",
        f"- Status: {case_result['status']}",
        f"- Audio file: {case_result['audio_file']}",
        f"- Source URL: {case_result['source_url']}",
        f"- Source family: {case_result['source_family']}",
        f"- Target language: {case_result['target_lang']}",
        f"- Notes: {case_result['notes']}",
        "",
        "## Runtime",
        f"- Audio download: {runtime['download_audio_s']} s",
        f"- Cached download reused: {runtime['used_cached_audio']}",
        f"- Audio duration: {runtime['audio_duration_s']} s",
        f"- File size: {runtime['file_size_mb']} MB",
        f"- Wall clock: {runtime['wall_clock_s']} s",
        f"- Real-time factor: {runtime['real_time_factor']}",
        f"- Throughput multiplier: {runtime['throughput_multiplier']}",
        "",
        "## Detection",
        f"- Audio profile: {detected['profile']}",
        f"- Source language: {detected['source_lang']}",
        f"- Probe source language: {detected['probe_source_lang']}",
        f"- Target language: {detected['target_lang']}",
        f"- ASR provider: {detected['asr_provider']}",
        f"- Selected route: {detected['route']}",
        f"- Requested translation policy: {detected['requested_translation_start_policy']}",
        f"- Effective translation policy: {detected['translation_start_policy']}",
        f"- Auto policy downgraded: {detected['auto_policy_downgraded']}",
        f"- NMT prefetch used: {detected['nmt_prefetch_used']}",
        f"- ASR fallback used: {detected['asr_fallback_used']}",
        f"- ASR model: {detected['model_used']}",
        f"- LLM refinement enabled: {detected['llm_refinement_enabled']}",
        "",
        "## Stage Metrics",
        f"- Audio prep: {stages.get('audio_prep_s')} s",
        f"- Inspect: {stages.get('inspect_s')} s",
        f"- VAD: {stages.get('vad_s')} s",
        f"- Time to first chunk: {stages.get('time_to_first_chunk_s')} s",
        f"- Time to first translated batch: {stages.get('time_to_first_translated_batch_s')} s",
        f"- First batch after first chunk: {stages.get('first_batch_after_first_chunk_s')} s",
        f"- Translated batches visible window: {stages.get('translated_batches_visible_window_s')} s",
        f"- Finalization after last batch: {stages.get('finalization_after_last_batch_s')} s",
        f"- Pipeline completed at: {stages.get('pipeline_completed_at_s')} s",
        "",
        "## Pipeline Internals",
        f"- SmartAligner timings: {metrics['pipeline_last_run_metrics'].get('smart_aligner', {})}",
        f"- Consumer timings (processing-only mode): {metrics['pipeline_last_run_metrics'].get('consumer', {})}",
        f"- Producer wait: {metrics['pipeline_last_run_metrics'].get('producer_wait')} s",
        f"- Pipeline total (internal): {metrics['pipeline_last_run_metrics'].get('pipeline_total')} s",
        "",
        "## Output Stats",
        f"- Segments: {output_stats['segment_count']}",
        f"- Total words: {output_stats['word_count_total']}",
        f"- Average words per segment: {output_stats['avg_words_per_segment']}",
        f"- Average segment duration: {output_stats['avg_segment_duration_s']} s",
        f"- Segments with translation text: {output_stats['translation_filled_segments']}",
        f"- Segments with phonetic text: {output_stats['phonetic_filled_segments']}",
        "",
        "## Streaming Stats",
        f"- Tier 1 chunks processed: {streaming['chunk_count']} ({streaming['chunk_sentence_total']} sentences)",
        f"- Tier 2 translated batches processed: {streaming['batch_count']} ({streaming['batch_segment_total']} segments)",
        f"- Final subtitle outputs written locally: {streaming['final_output_count']} ({streaming['final_segment_total']} segments)",
        f"- Final subtitle JSON: {case_result['final_json_path']}",
        "",
        "## Benchmark Mode",
        "- Database status writes: disabled",
        "- Redis notifications: disabled",
        "- MinIO uploads: disabled",
        "- Processing stream bookkeeping: in-memory only",
        "",
        "## Hardware",
        f"- Profile TXT: {case_result.get('hardware_profile_txt_path')}",
        f"- Profile CSV: {case_result.get('hardware_profile_csv_path')}",
    ]

    if hardware:
        lines.extend(
            [
                f"- Avg CPU: {hardware['avg_cpu']}%",
                f"- Peak CPU: {hardware['max_cpu']}%",
                f"- Avg RAM: {hardware['avg_ram_gb']} GB",
                f"- Peak RAM: {hardware['max_ram_gb']} GB",
                f"- Avg GPU util: {hardware['avg_gpu_util']}%",
                f"- Peak GPU util: {hardware['max_gpu_util']}%",
                f"- Avg GPU VRAM: {hardware['avg_gpu_mem_mb']} MB",
                f"- Peak GPU VRAM: {hardware['max_gpu_mem_mb']} MB",
                f"- Avg GPU temp: {hardware['avg_gpu_temp']} C",
                f"- Peak GPU temp: {hardware['max_gpu_temp']} C",
                f"- Avg GPU power: {hardware['avg_gpu_power']} W",
                f"- Peak GPU power: {hardware['max_gpu_power']} W",
            ]
        )

    lines.extend(
        ["", "## Timeline", "", "| t (s) | Event | Payload |", "| ---: | --- | --- |"]
    )
    for entry in trace:
        payload = {
            key: value for key, value in entry.items() if key not in {"event", "t"}
        }
        lines.append(f"| {entry['t']} | {entry['event']} | {payload} |")

    return "\n".join(lines) + "\n"


def _render_suite_markdown(summary: dict[str, Any]) -> str:
    case_results = summary["case_results"]
    family_averages = summary["family_averages"]

    lines = [
        "# AI Engine Benchmark Suite",
        "",
        "## Summary",
        f"- Generated at: {summary['generated_at']}",
        f"- Output directory: {summary['suite_dir']}",
        f"- Case count: {summary['case_count']}",
        f"- Completed: {summary['completed_count']}",
        f"- Failed: {summary['failed_count']}",
        f"- AI profile: {summary['settings']['ai_perf_mode']}",
        f"- Worker model mode: {summary['settings']['worker_model_mode']}",
        f"- LLM refinement enabled: {summary['settings']['llm_refinement_enabled']}",
        "",
        "## Case Table",
        *(_suite_case_table_rows(case_results)),
        "",
        "## Family Averages",
    ]

    if family_averages:
        lines.extend(
            [
                "| Family | Avg Wall Clock (s) | Avg RTF | Avg First Batch (s) | Avg Segments | Avg Merge (s) | Avg NMT (s) |",
                "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
            ]
        )
        for family, metrics in family_averages.items():
            lines.append(
                "| {family} | {wall_clock} | {rtf} | {first_batch} | {segments} | {merge} | {nmt} |".format(
                    family=family,
                    wall_clock=metrics.get("wall_clock_s", "-"),
                    rtf=metrics.get("real_time_factor", "-"),
                    first_batch=metrics.get("first_batch_s", "-"),
                    segments=metrics.get("segments", "-"),
                    merge=metrics.get("consumer_merge_s", "-"),
                    nmt=metrics.get("consumer_nmt_s", "-"),
                )
            )
    else:
        lines.append("No completed runs were available for family-level averages.")

    lines.extend(["", "## Notes"])
    if "english" in family_averages and "chinese" in family_averages:
        english = family_averages["english"]
        chinese = family_averages["chinese"]
        if chinese.get("consumer_merge_s", 0.0) > english.get("consumer_merge_s", 0.0):
            lines.append(
                "- Chinese runs spent more time in merge than English runs, which matches the expected CJK branch behavior."
            )
        if chinese.get("first_batch_s", 0.0) > english.get("first_batch_s", 0.0):
            lines.append(
                "- Chinese runs reached the first translated batch later than English runs on average."
            )
        if chinese.get("real_time_factor", 0.0) > english.get("real_time_factor", 0.0):
            lines.append(
                "- Chinese runs were slower relative to source duration than English runs on average."
            )
    lines.append(
        "- Subtitle text is intentionally excluded from these reports; see the separate final JSON outputs for transcript content."
    )
    lines.append(
        "- This suite benchmarks processing only. Database updates, Redis notifications, and MinIO uploads are disabled during the run."
    )

    return "\n".join(lines) + "\n"


async def _run_case(case: BenchmarkCase, suite_dir: Path) -> dict[str, Any]:
    audio_path, downloaded_title, used_cached_audio, download_audio_s = (
        _download_audio_fixture(case)
    )
    case_started_at = time.perf_counter()
    wall_clock_started_at = time.time()
    audio_duration_s = round(_probe_duration_seconds(audio_path), 3)
    run_media_id = f"benchmark-{case.case_id}-{uuid.uuid4().hex[:8]}"
    user_id = f"benchmark-user-{uuid.uuid4().hex[:8]}"
    case_label = downloaded_title or case.label

    logger.info(
        f"Running benchmark case {case.case_id} | audio={audio_path.name} | target={case.target_lang}"
    )

    _prepare_processing_only_runtime()

    trace: list[dict[str, Any]] = []
    pipeline = PipelineOrchestrator()
    processing_client = ProcessingOnlyMinioClient()
    profile_dir = suite_dir / "profiles" / case.case_id
    profiler = HardwareProfiler(interval=2.0, output_dir=profile_dir)

    final_json_path = suite_dir / "results" / f"{case.case_id}.final.json"
    metrics_json_path = suite_dir / "cases" / f"{case.case_id}.metrics.json"
    report_md_path = suite_dir / "cases" / f"{case.case_id}.report.md"

    status = "completed"
    error_message: str | None = None
    output = None

    profiler.start(job_id=case.case_id, media_id=run_media_id)
    try:
        output = await processing_pipeline.run_v2_pipeline_async(
            pipeline,
            processing_client,
            audio_path,
            run_media_id,
            user_id=user_id,
            started_at=wall_clock_started_at,
            target_lang=case.target_lang,
            duration_seconds=audio_duration_s,
            debug_trace=trace,
        )
        final_json_path.write_text(
            json.dumps(output.model_dump(), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except Exception as exc:
        status = "failed"
        error_message = str(exc)
        logger.exception(f"Benchmark case failed: {case.case_id}")
    finally:
        profiler.stop()

    wall_clock_s = round(time.perf_counter() - case_started_at, 3)
    run_metrics = dict(getattr(pipeline, "last_run_metrics", {}))
    hardware_metrics = _hardware_metrics(profiler.last_report)
    stage_metrics = _compute_stage_metrics(trace, run_metrics, wall_clock_s)

    if output is not None:
        detected = {
            "profile": output.metadata.engine_profile,
            "source_lang": output.metadata.source_lang,
            "target_lang": output.metadata.target_lang,
            "model_used": output.metadata.model_used,
            "llm_refinement_enabled": settings.AI_ENABLE_LLM_REFINEMENT,
            "asr_provider": str(run_metrics.get("asr_provider", "")),
            "route": run_metrics.get("route", ""),
            "probe_source_lang": run_metrics.get("probe_source_lang", ""),
            "requested_translation_start_policy": run_metrics.get(
                "requested_translation_start_policy",
                settings.translation_start_policy,
            ),
            "translation_start_policy": run_metrics.get(
                "translation_start_policy",
                settings.translation_start_policy,
            ),
            "auto_policy_downgraded": bool(
                run_metrics.get("auto_policy_downgraded", False)
            ),
            "nmt_prefetch_used": bool(run_metrics.get("nmt_prefetch_used", False)),
            "asr_fallback_used": bool(run_metrics.get("asr_fallback_used", False)),
        }
        output_stats = _output_metrics(output)
    else:
        detected = {
            "profile": settings.AI_PERF_MODE.value,
            "source_lang": "",
            "target_lang": case.target_lang,
            "model_used": str(run_metrics.get("selected_asr_model", "")),
            "llm_refinement_enabled": settings.AI_ENABLE_LLM_REFINEMENT,
            "asr_provider": str(run_metrics.get("asr_provider", "")),
            "route": str(run_metrics.get("route", "")),
            "probe_source_lang": str(run_metrics.get("probe_source_lang", "")),
            "requested_translation_start_policy": str(
                run_metrics.get(
                    "requested_translation_start_policy",
                    settings.translation_start_policy,
                )
            ),
            "translation_start_policy": str(
                run_metrics.get(
                    "translation_start_policy",
                    settings.translation_start_policy,
                )
            ),
            "auto_policy_downgraded": bool(
                run_metrics.get("auto_policy_downgraded", False)
            ),
            "nmt_prefetch_used": bool(run_metrics.get("nmt_prefetch_used", False)),
            "asr_fallback_used": bool(run_metrics.get("asr_fallback_used", False)),
        }
        output_stats = {
            "segment_count": 0,
            "word_count_total": 0,
            "avg_words_per_segment": 0.0,
            "avg_segment_duration_s": 0.0,
            "translation_filled_segments": 0,
            "phonetic_filled_segments": 0,
        }

    runtime = {
        "download_audio_s": download_audio_s,
        "used_cached_audio": used_cached_audio,
        "audio_duration_s": audio_duration_s,
        "file_size_mb": _file_size_mb(audio_path),
        "wall_clock_s": wall_clock_s,
        "real_time_factor": (
            round(wall_clock_s / audio_duration_s, 3) if audio_duration_s else None
        ),
        "throughput_multiplier": (
            round(audio_duration_s / wall_clock_s, 3) if wall_clock_s else None
        ),
    }

    metrics = {
        "runtime": runtime,
        "detected": detected,
        "stages": stage_metrics,
        "pipeline_last_run_metrics": run_metrics,
        "streaming": _streaming_metrics(
            processing_client,
            output_stats["segment_count"],
        ),
        "output": output_stats,
        "hardware": hardware_metrics,
        "trace": trace,
    }

    case_result = {
        "case_id": case.case_id,
        "audio_file": audio_path.name,
        "source_url": case.source_url,
        "source_family": case.source_family,
        "target_lang": case.target_lang,
        "label": case_label,
        "notes": case.notes,
        "status": status,
        "error": error_message,
        "metrics": metrics,
        "final_json_path": str(final_json_path) if output is not None else None,
        "metrics_json_path": str(metrics_json_path),
        "report_md_path": str(report_md_path),
        "hardware_profile_txt_path": (
            str(profiler.last_txt_path) if profiler.last_txt_path else None
        ),
        "hardware_profile_csv_path": (
            str(profiler.last_csv_path) if profiler.last_csv_path else None
        ),
    }

    metrics_json_path.write_text(
        json.dumps(case_result, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    report_md_path.write_text(_render_case_markdown(case_result), encoding="utf-8")

    logger.success(
        f"Finished benchmark case {case.case_id} | status={status} | wall_clock={wall_clock_s}s"
    )
    return case_result


async def run_suite(
    case_ids: list[str] | None,
    output_dir: Path | None = None,
) -> Path:
    benchmark_cases = load_benchmark_cases()
    suite_timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    suite_dir = (output_dir or OUTPUT_ROOT) / f"suite_{suite_timestamp}"
    (suite_dir / "cases").mkdir(parents=True, exist_ok=True)
    (suite_dir / "results").mkdir(parents=True, exist_ok=True)
    (suite_dir / "profiles").mkdir(parents=True, exist_ok=True)

    case_results: list[dict[str, Any]] = []
    selected_cases = _selected_cases(case_ids, benchmark_cases)
    for case in selected_cases:
        case_results.append(await _run_case(case, suite_dir))

    completed_count = sum(
        1 for result in case_results if result["status"] == "completed"
    )
    failed_count = len(case_results) - completed_count

    summary = {
        "generated_at": datetime.now().isoformat(),
        "suite_dir": str(suite_dir),
        "case_count": len(case_results),
        "completed_count": completed_count,
        "failed_count": failed_count,
        "settings": {
            "mode": "processing-only",
            "ai_perf_mode": settings.AI_PERF_MODE.value,
            "worker_model_mode": settings.WORKER_MODEL_MODE,
            "device": settings.DEVICE,
            "nmt_compute_type": settings.NMT_COMPUTE_TYPE,
            "llm_refinement_enabled": settings.AI_ENABLE_LLM_REFINEMENT,
            "asr_default_route_en": settings.asr_default_route_en,
            "asr_default_route_zh": settings.asr_default_route_zh,
            "chunk_size": settings.CHUNK_SIZE,
            "smart_aligner_group_size": settings.SMART_ALIGNER_GROUP_SIZE,
        },
        "catalog": {
            "benchmark_case_count": len(benchmark_cases),
            "test_media_url_counts_by_family": {
                family: len(urls) for family, urls in TEST_MEDIA_URLS_BY_FAMILY.items()
            },
        },
        "family_averages": _family_averages(case_results),
        "case_results": case_results,
    }

    summary_json_path = suite_dir / "benchmark_summary.json"
    summary_md_path = suite_dir / "benchmark_summary.md"
    summary_json_path.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    summary_md_path.write_text(_render_suite_markdown(summary), encoding="utf-8")

    logger.success(f"Benchmark suite summary written to {summary_md_path}")

    if failed_count:
        raise RuntimeError(
            f"Benchmark suite completed with {failed_count} failed case(s). See {summary_md_path}"
        )

    return suite_dir


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run the local AI engine benchmark suite"
    )
    parser.add_argument(
        "--case",
        action="append",
        help="Run only the selected benchmark case. Can be passed multiple times.",
    )
    parser.add_argument(
        "--list-cases",
        action="store_true",
        help="Print available benchmark cases and exit.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="Optional custom output root for benchmark reports.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    try:
        benchmark_cases = load_benchmark_cases()
        if args.list_cases:
            for case in benchmark_cases:
                print(f"{case.case_id}: {case.label} | {case.source_url}")
            return

        asyncio.run(run_suite(args.case, args.output_dir))
    except (FileNotFoundError, ValueError, KeyError) as exc:
        raise SystemExit(str(exc)) from exc


if __name__ == "__main__":
    main()
