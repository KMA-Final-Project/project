from __future__ import annotations

import gc
import os
import threading
import time as _time
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

import numpy as np
from loguru import logger

from src.config import settings
from src.schemas import Word


@dataclass(frozen=True)
class ForcedAlignmentUnit:
    text: str
    start: float
    end: float

    def as_metrics(self) -> dict[str, Any]:
        return {
            "text": self.text,
            "start": round(self.start, 4),
            "end": round(self.end, 4),
        }


class Qwen3ForcedAlignerProvider:
    _instance: "Qwen3ForcedAlignerProvider | None" = None
    _instance_lock = threading.Lock()

    @classmethod
    def get_instance(cls) -> "Qwen3ForcedAlignerProvider":
        with cls._instance_lock:
            if cls._instance is None:
                cls._instance = cls()
        return cls._instance

    @classmethod
    def unload_instance(cls) -> None:
        instance = cls._instance
        if instance is None:
            return
        instance.unload()

    def __init__(self) -> None:
        self._model: Any | None = None
        self._load_lock = threading.Lock()
        self.last_timing: dict[str, float] = {}
        self.last_language: str = ""
        self.last_unit_count: int = 0
        self._raw_item_schema_logged = False

    def _configure_runtime_cache(self) -> Path:
        cache_root = settings.AI_QWEN3_FORCE_ALIGNER_CACHE_DIR.resolve()
        cache_root.mkdir(parents=True, exist_ok=True)
        hf_home = cache_root / "huggingface"
        hf_home.mkdir(parents=True, exist_ok=True)
        os.environ.setdefault("HF_HOME", str(hf_home))
        os.environ.setdefault("HF_HUB_CACHE", str(hf_home / "hub"))
        return cache_root

    @staticmethod
    def normalize_unit_text(text: str) -> str:
        normalized = unicodedata.normalize("NFKC", str(text or ""))
        compact = "".join(
            char
            for char in normalized
            if not unicodedata.category(char).startswith(("Z", "C"))
        )
        return compact.casefold()

    @staticmethod
    def _language_name(source_lang: str) -> str:
        normalized = settings.normalize_language_tag(source_lang).split("-")[0]
        if normalized == "zh":
            return "Chinese"
        if normalized == "yue":
            return "Cantonese"
        raise ValueError(f"Unsupported Qwen3 forced-align language: {source_lang}")

    def ensure_loaded(self) -> float:
        if self._model is not None:
            return 0.0

        with self._load_lock:
            if self._model is not None:
                return 0.0

            cache_root = self._configure_runtime_cache()
            resolved_device = settings.qwen3_force_aligner_device
            configured_device = str(settings.AI_QWEN3_FORCE_ALIGNER_DEVICE or "cpu").strip().lower()
            if configured_device != "cpu":
                logger.warning(
                    "Qwen3 forced aligner device '{}' is not supported in v1; forcing cpu",
                    configured_device,
                )

            import torch
            from qwen_asr import Qwen3ForcedAligner

            torch.set_num_threads(settings.qwen3_force_aligner_num_threads)

            started_at = _time.perf_counter()
            self._model = Qwen3ForcedAligner.from_pretrained(
                settings.AI_QWEN3_FORCE_ALIGNER_MODEL,
                dtype=torch.float32,
                device_map=resolved_device,
                cache_dir=str(cache_root),
            )
            elapsed = _time.perf_counter() - started_at
            self.last_timing = {
                "load": round(elapsed, 3),
                "align": 0.0,
                "total": round(elapsed, 3),
            }
            logger.info(
                "Qwen3 forced aligner loaded on {} in {:.2f}s (threads={})",
                resolved_device,
                elapsed,
                settings.qwen3_force_aligner_num_threads,
            )
            return elapsed

    def align_sentence(
        self,
        *,
        audio: np.ndarray,
        sample_rate: int,
        reference_text: str,
        source_lang: str,
        baseline_words: Sequence[Word] | None = None,
    ) -> list[ForcedAlignmentUnit]:
        del baseline_words
        load_elapsed = self.ensure_loaded()
        if self._model is None:
            raise RuntimeError("Qwen3 forced aligner is not initialized")

        language_name = self._language_name(source_lang)
        started_at = _time.perf_counter()
        results = self._model.align(
            audio=(audio, sample_rate),
            text=reference_text,
            language=language_name,
        )
        align_elapsed = _time.perf_counter() - started_at

        items = self._coerce_items(results)
        self.last_language = language_name
        self.last_unit_count = len(items)
        self.last_timing = {
            "load": round(load_elapsed, 3),
            "align": round(align_elapsed, 3),
            "total": round(load_elapsed + align_elapsed, 3),
        }
        return items

    @staticmethod
    def _coerce_items(result: Any) -> list[ForcedAlignmentUnit]:
        if result is None:
            return []

        items = Qwen3ForcedAlignerProvider._unwrap_alignment_items(result)

        Qwen3ForcedAlignerProvider._log_raw_item_schema_once(items)

        aligned: list[ForcedAlignmentUnit] = []
        for item in items or []:
            item_dict = Qwen3ForcedAlignerProvider._item_as_mapping(item)
            text = Qwen3ForcedAlignerProvider._first_present(
                item,
                item_dict,
                ("text", "word", "token", "label", "value"),
                default="",
            )
            start = Qwen3ForcedAlignerProvider._coerce_float(
                Qwen3ForcedAlignerProvider._first_present(
                    item,
                    item_dict,
                    ("start_time", "start", "begin", "offset"),
                    default=0.0,
                )
            )
            end = Qwen3ForcedAlignerProvider._coerce_float(
                Qwen3ForcedAlignerProvider._first_present(
                    item,
                    item_dict,
                    ("end_time", "end", "stop"),
                    default=0.0,
                )
            )
            aligned.append(ForcedAlignmentUnit(text=text, start=start, end=end))
        return aligned

    @staticmethod
    def _unwrap_alignment_items(result: Any) -> list[Any]:
        pending = list(result) if isinstance(result, (list, tuple)) else [result]
        flattened: list[Any] = []

        while pending:
            item = pending.pop(0)
            nested_items = Qwen3ForcedAlignerProvider._nested_alignment_items(item)
            if nested_items is not None:
                pending = list(nested_items) + pending
                continue
            if isinstance(item, (list, tuple)):
                pending = list(item) + pending
                continue
            flattened.append(item)

        return flattened

    @staticmethod
    def _nested_alignment_items(item: Any) -> Sequence[Any] | None:
        item_dict = Qwen3ForcedAlignerProvider._item_as_mapping(item)
        nested = item_dict.get("items")
        if isinstance(nested, (list, tuple)):
            return nested

        nested = getattr(item, "items", None)
        if isinstance(nested, (list, tuple)):
            return nested
        return None

    @classmethod
    def _log_raw_item_schema_once(cls, items: Any) -> None:
        if cls._instance is None or cls._instance._raw_item_schema_logged:
            return
        if not items:
            return

        first_item = items[0]
        cls._instance._raw_item_schema_logged = True
        logger.info(
            "--- QWEN ALIGNER RAW ITEM TYPE: {} ---",
            type(first_item),
        )
        if isinstance(first_item, dict):
            logger.info(
                "Qwen aligner raw item keys: {} | sample: {}",
                list(first_item.keys()),
                first_item,
            )
            return

        logger.info(
            "Qwen aligner raw item attrs: {} | __dict__: {}",
            [name for name in dir(first_item) if not name.startswith("__")][:80],
            getattr(first_item, "__dict__", "No __dict__"),
        )

    @staticmethod
    def _item_as_mapping(item: Any) -> dict[str, Any]:
        if isinstance(item, dict):
            return item
        if hasattr(item, "model_dump"):
            try:
                dumped = item.model_dump()
                if isinstance(dumped, dict):
                    return dumped
            except Exception:
                pass
        if hasattr(item, "_asdict"):
            try:
                dumped = item._asdict()
                if isinstance(dumped, dict):
                    return dumped
            except Exception:
                pass
        raw_dict = getattr(item, "__dict__", None)
        if isinstance(raw_dict, dict):
            return raw_dict
        return {}

    @staticmethod
    def _first_present(
        item: Any,
        item_dict: dict[str, Any],
        keys: tuple[str, ...],
        *,
        default: Any,
    ) -> Any:
        for key in keys:
            if key in item_dict and item_dict[key] not in (None, ""):
                return item_dict[key]
            value = getattr(item, key, None)
            if value not in (None, ""):
                return value
        return default

    @staticmethod
    def _coerce_float(value: Any) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0

    def unload(self) -> None:
        if self._model is None:
            return
        self._model = None
        self.last_unit_count = 0
        gc.collect()
