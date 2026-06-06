"""
Hardware Profiler — Background GPU/CPU/RAM sampler.

Runs in a background thread during AI processing, samples hardware stats
every N seconds, and writes a human-readable report + CSV to disk.

Usage:
    profiler = HardwareProfiler(interval=2.0)
    profiler.start(job_id="1", media_id="abc123")
    # ... do GPU work ...
    profiler.stop()  # writes report to outputs/profiles/

Dependencies:
    pip install pynvml psutil
"""

from __future__ import annotations

import csv
import os
import time
import threading
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import List, Optional

import psutil
from loguru import logger
import platform

from src.config import settings

try:
    import pynvml
    HAS_NVML = True
except ImportError:
    HAS_NVML = False
    logger.warning("pynvml not installed — GPU stats will be unavailable. Install with: pip install pynvml")


@dataclass
class Sample:
    """Single point-in-time hardware snapshot."""
    timestamp: float             # seconds since profiler start
    cpu_percent: float           # overall CPU usage %
    ram_used_gb: float           # RAM used (GB)
    ram_total_gb: float          # RAM total (GB)
    ram_percent: float           # RAM usage %
    process_cpu_percent: float   # AI-engine process-tree CPU usage %
    process_rss_gb: float        # AI-engine process-tree RSS (GB)
    process_thread_count: int    # AI-engine process-tree thread count
    process_child_count: int     # direct+indirect child process count
    gpu_util_percent: float      # GPU compute utilization %
    gpu_mem_used_mb: float       # GPU VRAM used (MB)
    gpu_mem_total_mb: float      # GPU VRAM total (MB)
    gpu_mem_percent: float       # GPU VRAM usage %
    gpu_temp_c: float            # GPU temperature (°C)
    gpu_power_w: float           # GPU power draw (W)


@dataclass
class ProfileReport:
    """Aggregated statistics from a profiling session."""
    job_id: str
    media_id: str
    duration_seconds: float
    sample_count: int
    samples: List[Sample] = field(default_factory=list)

    # Aggregates (computed on stop)
    avg_cpu: float = 0.0
    max_cpu: float = 0.0
    avg_ram_gb: float = 0.0
    max_ram_gb: float = 0.0
    avg_process_cpu: float = 0.0
    max_process_cpu: float = 0.0
    avg_process_rss_gb: float = 0.0
    max_process_rss_gb: float = 0.0
    max_process_thread_count: int = 0
    max_process_child_count: int = 0
    avg_gpu_util: float = 0.0
    max_gpu_util: float = 0.0
    avg_gpu_mem_mb: float = 0.0
    max_gpu_mem_mb: float = 0.0
    gpu_mem_total_mb: float = 0.0
    avg_gpu_temp: float = 0.0
    max_gpu_temp: float = 0.0
    avg_gpu_power: float = 0.0
    max_gpu_power: float = 0.0
    host_platform: str = ""
    configured_device: str = ""
    nvml_available: bool = False
    mps_available: bool = False


class HardwareProfiler:
    """
    Background hardware sampler.

    Spawns a daemon thread that samples CPU/RAM/GPU metrics at a fixed
    interval. Call start() before processing and stop() after. The report
    is written as both a human-readable .txt and a machine-readable .csv.
    """

    def __init__(self, interval: float = 2.0, output_dir: str | Path | None = None):
        """
        Args:
            interval: Seconds between samples.
            output_dir: Where to write reports. Defaults to outputs/profiles/.
        """
        self._interval = interval
        self._output_dir = Path(output_dir) if output_dir else Path("outputs/profiles")
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._samples: List[Sample] = []
        self._start_time: float = 0.0
        self._job_id: str = ""
        self._media_id: str = ""
        self._nvml_handle = None
        self._root_process: Optional[psutil.Process] = None
        self.last_report: Optional[ProfileReport] = None
        self.last_txt_path: Optional[Path] = None
        self.last_csv_path: Optional[Path] = None

        # Initialize NVML once
        if HAS_NVML:
            try:
                pynvml.nvmlInit()
                self._nvml_handle = pynvml.nvmlDeviceGetHandleByIndex(0)
                name = pynvml.nvmlDeviceGetName(self._nvml_handle)
                logger.info(f"HardwareProfiler: GPU detected — {name}")
            except Exception as e:
                logger.warning(f"HardwareProfiler: Failed to init NVML — {e}")
                self._nvml_handle = None

    def start(self, job_id: str = "", media_id: str = "", pid: int | None = None):
        """Begin sampling in background thread."""
        if self._thread and self._thread.is_alive():
            logger.warning("Profiler already running, stopping previous session")
            self.stop()

        self._samples = []
        self._stop_event.clear()
        self._start_time = time.monotonic()
        self._job_id = job_id
        self._media_id = media_id
        target_pid = pid or os.getpid()
        try:
            self._root_process = psutil.Process(target_pid)
            self._root_process.cpu_percent(interval=None)
            for child in self._root_process.children(recursive=True):
                child.cpu_percent(interval=None)
        except psutil.Error as exc:
            logger.warning(f"Profiler: failed to bind process tree for PID {target_pid}: {exc}")
            self._root_process = None
        self.last_report = None
        self.last_txt_path = None
        self.last_csv_path = None

        self._thread = threading.Thread(target=self._sample_loop, daemon=True)
        self._thread.start()
        logger.info(f"📊 Profiler started (interval={self._interval}s)")

    def stop(self) -> Optional[Path]:
        """Stop sampling and write report. Returns path to the report file."""
        if not self._thread or not self._thread.is_alive():
            logger.warning("Profiler not running")
            return None

        self._stop_event.set()
        self._thread.join(timeout=self._interval + 1)
        duration = time.monotonic() - self._start_time

        if not self._samples:
            logger.warning("No samples collected")
            return None

        report = self._build_report(duration)
        txt_path, csv_path = self._write_report(report)
        self.last_report = report
        self.last_txt_path = txt_path
        self.last_csv_path = csv_path
        logger.success(f"📊 Profiler stopped — {report.sample_count} samples over {duration:.1f}s → {txt_path}")
        return txt_path

    # ── Internal ─────────────────────────────────────────────────────────

    def _sample_loop(self):
        """Background sampling loop."""
        while not self._stop_event.is_set():
            try:
                sample = self._take_sample()
                self._samples.append(sample)
            except Exception as e:
                logger.warning(f"Profiler sample error: {e}")
            self._stop_event.wait(self._interval)

    def _take_sample(self) -> Sample:
        """Capture one hardware snapshot."""
        elapsed = time.monotonic() - self._start_time

        # CPU & RAM
        cpu_percent = psutil.cpu_percent(interval=None)
        mem = psutil.virtual_memory()
        ram_used_gb = mem.used / (1024 ** 3)
        ram_total_gb = mem.total / (1024 ** 3)
        process_cpu_percent = 0.0
        process_rss_gb = 0.0
        process_thread_count = 0
        process_child_count = 0

        if self._root_process is not None:
            process_cpu_percent, process_rss_gb, process_thread_count, process_child_count = (
                self._collect_process_tree_metrics(self._root_process)
            )

        # GPU
        gpu_util = 0.0
        gpu_mem_used = 0.0
        gpu_mem_total = 0.0
        gpu_temp = 0.0
        gpu_power = 0.0

        if self._nvml_handle:
            try:
                util = pynvml.nvmlDeviceGetUtilizationRates(self._nvml_handle)
                gpu_util = float(util.gpu)

                mem_info = pynvml.nvmlDeviceGetMemoryInfo(self._nvml_handle)
                gpu_mem_used = mem_info.used / (1024 ** 2)
                gpu_mem_total = mem_info.total / (1024 ** 2)

                gpu_temp = float(pynvml.nvmlDeviceGetTemperature(
                    self._nvml_handle, pynvml.NVML_TEMPERATURE_GPU
                ))

                gpu_power = pynvml.nvmlDeviceGetPowerUsage(self._nvml_handle) / 1000.0  # mW → W
            except Exception:
                pass  # GPU stats unavailable this sample

        gpu_mem_percent = (gpu_mem_used / gpu_mem_total * 100) if gpu_mem_total > 0 else 0.0

        return Sample(
            timestamp=round(elapsed, 1),
            cpu_percent=round(cpu_percent, 1),
            ram_used_gb=round(ram_used_gb, 2),
            ram_total_gb=round(ram_total_gb, 2),
            ram_percent=round(mem.percent, 1),
            process_cpu_percent=round(process_cpu_percent, 1),
            process_rss_gb=round(process_rss_gb, 2),
            process_thread_count=process_thread_count,
            process_child_count=process_child_count,
            gpu_util_percent=round(gpu_util, 1),
            gpu_mem_used_mb=round(gpu_mem_used, 0),
            gpu_mem_total_mb=round(gpu_mem_total, 0),
            gpu_mem_percent=round(gpu_mem_percent, 1),
            gpu_temp_c=round(gpu_temp, 0),
            gpu_power_w=round(gpu_power, 1),
        )

    def _collect_process_tree_metrics(
        self, root_process: psutil.Process
    ) -> tuple[float, float, int, int]:
        """Collect CPU/RSS/thread metrics for the worker process and its children."""
        try:
            processes = [root_process] + root_process.children(recursive=True)
        except psutil.Error:
            processes = [root_process]

        alive: list[psutil.Process] = []
        for proc in processes:
            try:
                if proc.is_running() and proc.status() != psutil.STATUS_ZOMBIE:
                    alive.append(proc)
            except psutil.Error:
                continue

        total_cpu = 0.0
        total_rss_bytes = 0
        total_threads = 0
        for proc in alive:
            try:
                total_cpu += proc.cpu_percent(interval=None)
                total_rss_bytes += proc.memory_info().rss
                total_threads += proc.num_threads()
            except psutil.Error:
                continue

        return (
            total_cpu,
            total_rss_bytes / (1024 ** 3),
            total_threads,
            max(0, len(alive) - 1),
        )

    def _build_report(self, duration: float) -> ProfileReport:
        """Aggregate samples into a report."""
        report = ProfileReport(
            job_id=self._job_id,
            media_id=self._media_id,
            duration_seconds=round(duration, 1),
            sample_count=len(self._samples),
            samples=self._samples,
        )

        n = len(self._samples)
        report.avg_cpu = round(sum(s.cpu_percent for s in self._samples) / n, 1)
        report.max_cpu = round(max(s.cpu_percent for s in self._samples), 1)
        report.avg_ram_gb = round(sum(s.ram_used_gb for s in self._samples) / n, 2)
        report.max_ram_gb = round(max(s.ram_used_gb for s in self._samples), 2)
        report.avg_process_cpu = round(
            sum(s.process_cpu_percent for s in self._samples) / n, 1
        )
        report.max_process_cpu = round(
            max(s.process_cpu_percent for s in self._samples), 1
        )
        report.avg_process_rss_gb = round(
            sum(s.process_rss_gb for s in self._samples) / n, 2
        )
        report.max_process_rss_gb = round(
            max(s.process_rss_gb for s in self._samples), 2
        )
        report.max_process_thread_count = max(
            s.process_thread_count for s in self._samples
        )
        report.max_process_child_count = max(
            s.process_child_count for s in self._samples
        )
        report.avg_gpu_util = round(sum(s.gpu_util_percent for s in self._samples) / n, 1)
        report.max_gpu_util = round(max(s.gpu_util_percent for s in self._samples), 1)
        report.avg_gpu_mem_mb = round(sum(s.gpu_mem_used_mb for s in self._samples) / n, 0)
        report.max_gpu_mem_mb = round(max(s.gpu_mem_used_mb for s in self._samples), 0)
        report.gpu_mem_total_mb = self._samples[0].gpu_mem_total_mb
        report.avg_gpu_temp = round(sum(s.gpu_temp_c for s in self._samples) / n, 0)
        report.max_gpu_temp = round(max(s.gpu_temp_c for s in self._samples), 0)
        report.avg_gpu_power = round(sum(s.gpu_power_w for s in self._samples) / n, 1)
        report.max_gpu_power = round(max(s.gpu_power_w for s in self._samples), 1)
        report.host_platform = platform.platform()
        report.configured_device = settings.DEVICE
        report.nvml_available = self._nvml_handle is not None
        try:
            import torch

            report.mps_available = bool(
                getattr(torch.backends, "mps", None)
                and torch.backends.mps.is_available()
            )
        except Exception:
            report.mps_available = False

        return report

    def _write_report(self, report: ProfileReport) -> tuple[Path, Path]:
        """Write human-readable .txt and machine-readable .csv."""
        self._output_dir.mkdir(parents=True, exist_ok=True)

        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        base_name = f"profile_{ts}_job{report.job_id}"

        # ── Human-readable report ────────────────────────────────────
        txt_path = self._output_dir / f"{base_name}.txt"
        vram_free = report.gpu_mem_total_mb - report.max_gpu_mem_mb

        with open(txt_path, "w", encoding="utf-8") as f:
            f.write("=" * 70 + "\n")
            f.write("  HARDWARE PROFILE REPORT\n")
            f.write("=" * 70 + "\n\n")
            f.write(f"  Job ID:       {report.job_id}\n")
            f.write(f"  Media ID:     {report.media_id}\n")
            f.write(f"  Duration:     {report.duration_seconds:.1f}s\n")
            f.write(f"  Samples:      {report.sample_count} (every {self._interval}s)\n")
            f.write(f"  Generated:    {datetime.now().isoformat()}\n")
            f.write("\n" + "-" * 70 + "\n")
            f.write("  EXECUTION CONTEXT\n")
            f.write("-" * 70 + "\n")
            f.write(f"  Host:         {report.host_platform}\n")
            f.write(f"  Device:       {report.configured_device}\n")
            f.write(f"  NVML GPU:     {'available' if report.nvml_available else 'unavailable'}\n")
            f.write(f"  MPS Runtime:  {'available' if report.mps_available else 'unavailable'}\n")
            f.write("\n" + "-" * 70 + "\n")
            f.write("  CPU\n")
            f.write("-" * 70 + "\n")
            f.write(f"  Average:      {report.avg_cpu}%\n")
            f.write(f"  Peak:         {report.max_cpu}%\n")
            f.write("\n" + "-" * 70 + "\n")
            f.write("  RAM\n")
            f.write("-" * 70 + "\n")
            f.write(f"  Average:      {report.avg_ram_gb:.2f} GB\n")
            f.write(f"  Peak:         {report.max_ram_gb:.2f} GB\n")
            f.write(f"  Total:        {report.samples[0].ram_total_gb:.2f} GB\n")
            f.write("\n" + "-" * 70 + "\n")
            f.write("  AI ENGINE PROCESS TREE\n")
            f.write("-" * 70 + "\n")
            f.write(f"  Avg CPU:      {report.avg_process_cpu}%\n")
            f.write(f"  Peak CPU:     {report.max_process_cpu}%\n")
            f.write(f"  Avg RSS:      {report.avg_process_rss_gb:.2f} GB\n")
            f.write(f"  Peak RSS:     {report.max_process_rss_gb:.2f} GB\n")
            f.write(f"  Peak Threads: {report.max_process_thread_count}\n")
            f.write(f"  Peak Children:{report.max_process_child_count}\n")
            f.write("\n" + "-" * 70 + "\n")
            f.write("  GPU COMPUTE\n")
            f.write("-" * 70 + "\n")
            if report.nvml_available:
                f.write(f"  Average:      {report.avg_gpu_util}%\n")
                f.write(f"  Peak:         {report.max_gpu_util}%\n")
            else:
                f.write("  Unavailable for this host/runtime.\n")
            f.write("\n" + "-" * 70 + "\n")
            f.write("  GPU VRAM\n")
            f.write("-" * 70 + "\n")
            if report.nvml_available:
                f.write(f"  Average:      {report.avg_gpu_mem_mb:.0f} MB\n")
                f.write(f"  Peak:         {report.max_gpu_mem_mb:.0f} MB\n")
                f.write(f"  Total:        {report.gpu_mem_total_mb:.0f} MB\n")
                f.write(f"  Free at peak: {vram_free:.0f} MB\n")
            else:
                f.write("  Unavailable for this host/runtime.\n")
            f.write("\n" + "-" * 70 + "\n")
            f.write("  GPU THERMAL & POWER\n")
            f.write("-" * 70 + "\n")
            if report.nvml_available:
                f.write(f"  Avg Temp:     {report.avg_gpu_temp:.0f}°C\n")
                f.write(f"  Peak Temp:    {report.max_gpu_temp:.0f}°C\n")
                f.write(f"  Avg Power:    {report.avg_gpu_power:.1f}W\n")
                f.write(f"  Peak Power:   {report.max_gpu_power:.1f}W\n")
            else:
                f.write("  Unavailable for this host/runtime.\n")
            f.write("\n" + "=" * 70 + "\n")
            f.write("  SCALING ANALYSIS\n")
            f.write("=" * 70 + "\n\n")

            # Auto-analysis
            if not report.nvml_available:
                f.write("  ℹ️ NVML-compatible GPU telemetry is unavailable on this host.\n")
                f.write("     → Treat this report as CPU/process-oriented, not GPU-oriented.\n")
                f.write(
                    f"     → The active AI engine is configured for DEVICE={report.configured_device}, "
                    "so CPU-heavy ASR/NMT latency is expected on this machine.\n"
                )
            elif report.avg_gpu_util < 30:
                f.write("  ⚡ GPU compute is UNDERUTILIZED (avg <30%).\n")
                f.write("     → Batched inference (batch_size=4-8) could significantly help.\n")
                f.write("     → A second worker MAY be feasible if VRAM allows.\n")
            elif report.avg_gpu_util < 60:
                f.write("  📊 GPU compute is MODERATELY used (30-60%).\n")
                f.write("     → Batched inference could improve throughput.\n")
                f.write("     → A second worker is unlikely to help.\n")
            else:
                f.write("  🔥 GPU compute is HEAVILY used (>60%).\n")
                f.write("     → This worker is well-optimized for single GPU.\n")
                f.write("     → Scaling requires additional GPUs or cloud.\n")

            f.write("\n")

            if not report.nvml_available:
                f.write(
                    f"  🧠 Process peak RSS reached {report.max_process_rss_gb:.2f} GB "
                    f"with peak process CPU {report.max_process_cpu}%.\n"
                )
                f.write("     → Compare these numbers across machines to separate compute limits from I/O waits.\n")
            elif vram_free > 4000:
                f.write(f"  💾 VRAM headroom: {vram_free:.0f} MB free at peak.\n")
                f.write("     → Enough for a second lightweight model (turbo/medium).\n")
            elif vram_free > 2000:
                f.write(f"  💾 VRAM headroom: {vram_free:.0f} MB free at peak.\n")
                f.write("     → Tight. A second small model might fit.\n")
            else:
                f.write(f"  💾 VRAM headroom: {vram_free:.0f} MB free at peak.\n")
                f.write("     → No room for a second model. Single worker is the limit.\n")

            f.write("\n" + "=" * 70 + "\n")

        # ── CSV for detailed analysis ────────────────────────────────
        csv_path = self._output_dir / f"{base_name}.csv"
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow([
                "timestamp_s", "cpu_%", "ram_used_gb", "ram_%",
                "process_cpu_%", "process_rss_gb", "process_threads", "process_children",
                "gpu_util_%", "gpu_mem_used_mb", "gpu_mem_%",
                "gpu_temp_c", "gpu_power_w",
            ])
            for s in report.samples:
                writer.writerow([
                    s.timestamp, s.cpu_percent, s.ram_used_gb, s.ram_percent,
                    s.process_cpu_percent, s.process_rss_gb, s.process_thread_count, s.process_child_count,
                    s.gpu_util_percent, s.gpu_mem_used_mb, s.gpu_mem_percent,
                    s.gpu_temp_c, s.gpu_power_w,
                ])

        logger.info(f"Reports written: {txt_path} | {csv_path}")
        return txt_path, csv_path
