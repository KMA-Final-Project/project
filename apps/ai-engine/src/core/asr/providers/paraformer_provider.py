from __future__ import annotations

import ast
import gc
import os
import tempfile
import time
from pathlib import Path
from typing import Any, Callable

import librosa
import numpy as np
import soundfile as sf
from loguru import logger

from src.config import settings
from src.core.asr.base import ASRProvider, ASRRouteConfig
from src.core.asr.phonetics import add_phonetic_annotations
from src.schemas import Sentence, VADSegment, Word


class ParaformerZhASRProvider(ASRProvider):
    def __init__(self, route: ASRRouteConfig) -> None:
        self.route = route
        self._model: Any | None = None
        self._aligner: Any | None = None
        self.last_timing: dict[str, float] = {}
        self.last_diagnostics: dict[str, Any] = {}
        self.last_probe_details: dict[str, Any] = {}

    def ensure_loaded(self) -> None:
        if self._model is not None:
            return

        from funasr import AutoModel

        self._configure_cache_env()
        self._model = AutoModel(
            model=settings.FUNASR_PARAFORMER_ZH_MODEL,
            hub=settings.FUNASR_MODEL_HUB,
            disable_update=settings.FUNASR_DISABLE_UPDATE_CHECK,
            vad_model=settings.FUNASR_VAD_MODEL,
            vad_kwargs={
                "max_single_segment_time": settings.FUNASR_MAX_SINGLE_SEGMENT_TIME_MS,
            },
            punc_model=settings.FUNASR_PUNC_MODEL,
            device=self._device_name(),
        )
        if settings.FUNASR_ENABLE_FA_ZH_ALIGNMENT:
            self._aligner = AutoModel(
                model=settings.FUNASR_FA_ZH_MODEL,
                hub=settings.FUNASR_MODEL_HUB,
                disable_update=settings.FUNASR_DISABLE_UPDATE_CHECK,
                device=self._device_name(),
            )
        logger.success(
            f"✅ Experimental ASR route loaded: {self.route.route_id} -> {self.route.model_id}"
        )

    def unload(self, *, to_cpu: bool = False) -> None:
        if self._model is None and self._aligner is None:
            return
        self._model = None
        self._aligner = None
        gc.collect()

    def probe_language(
        self,
        file_path: Path | str,
        segments: list[VADSegment],
        *,
        audio_array: np.ndarray | None = None,
        max_segments: int | None = None,
        max_seconds: float | None = None,
    ) -> str | None:
        return None

    def process(
        self,
        file_path: Path | str,
        segments: list[VADSegment],
        *,
        profile: str,
        on_chunk: Callable[[list[Sentence], int], None] | None,
        chunk_size: int,
        audio_array: np.ndarray | None = None,
        source_language: str | None = None,
    ) -> list[Sentence]:
        self.ensure_loaded()
        started_at = time.perf_counter()
        path = Path(file_path)
        if not path.exists() and audio_array is None:
            raise FileNotFoundError(f"Audio file not found: {path}")

        if audio_array is None:
            audio_full, _sample_rate = librosa.load(str(path), sr=16000)
        else:
            audio_full = audio_array.astype(np.float32, copy=False)

        all_sentences: list[Sentence] = []
        pending_chunk: list[Sentence] = []
        emitted_total = 0
        effective_chunk_size = max(1, chunk_size)
        phoneme_elapsed = 0.0
        for segment in segments:
            pending_chunk.extend(self._transcribe_segment_audio(audio_full, segment))
            while len(pending_chunk) >= effective_chunk_size:
                batch = pending_chunk[:effective_chunk_size]
                del pending_chunk[:effective_chunk_size]
                phoneme_started_at = time.perf_counter()
                add_phonetic_annotations(batch, "zh")
                phoneme_elapsed += time.perf_counter() - phoneme_started_at
                all_sentences.extend(batch)
                emitted_total += len(batch)
                if on_chunk:
                    on_chunk(batch, emitted_total)

        if pending_chunk:
            phoneme_started_at = time.perf_counter()
            add_phonetic_annotations(pending_chunk, "zh")
            phoneme_elapsed += time.perf_counter() - phoneme_started_at
            all_sentences.extend(pending_chunk)
            emitted_total += len(pending_chunk)
            if on_chunk:
                on_chunk(list(pending_chunk), emitted_total)

        total_elapsed = time.perf_counter() - started_at
        transcription_elapsed = max(0.0, total_elapsed - phoneme_elapsed)
        self.last_timing = {
            "transcription": round(transcription_elapsed, 3),
            "phonemes": round(phoneme_elapsed, 3),
            "post_proc": 0.0,
            "overhead": 0.0,
            "total": round(total_elapsed, 3),
        }
        word_confidences = [
            float(word.confidence or 0.0)
            for sentence in all_sentences
            for word in sentence.words
        ]
        self.last_diagnostics = {
            "avg_word_confidence": round(
                sum(word_confidences) / len(word_confidences), 4
            )
            if word_confidences
            else 0.0,
            "detected_lang": "zh",
            "sentence_count": len(all_sentences),
        }
        return all_sentences

    def healthcheck(self) -> dict[str, Any]:
        return {
            "provider_id": self.route.provider_id,
            "route_id": self.route.route_id,
            "model_id": self.route.model_id,
            "loaded": self._model is not None,
            "alignment_loaded": self._aligner is not None,
            "during_asr_certified": self.route.during_asr_certified,
        }

    def _transcribe_segment_audio(
        self,
        audio_full: np.ndarray,
        segment: VADSegment,
    ) -> list[Sentence]:
        start_sample = max(0, int(segment.start * 16000))
        end_sample = max(start_sample, int(segment.end * 16000))
        segment_audio = audio_full[start_sample:end_sample]
        if segment_audio.size < 160:
            return []

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_wav:
            wav_path = Path(temp_wav.name)
        with tempfile.NamedTemporaryFile(
            suffix=".txt", delete=False, mode="w", encoding="utf-8"
        ) as temp_txt:
            text_path = Path(temp_txt.name)
        try:
            sf.write(wav_path, segment_audio, 16000)
            raw = self._generate(wav_path)
            text = self._extract_text(raw)
            if not text:
                return []
            text_path.write_text(text, encoding="utf-8")
            timestamps = self._extract_timestamps(raw) or self._align_text(wav_path, text_path)
            words = self._words_from_timestamps(text, segment, timestamps)
            if not words:
                return []
            return [
                Sentence(
                    text=text,
                    start=words[0].start,
                    end=words[-1].end,
                    words=words,
                    detected_lang="zh",
                )
            ]
        finally:
            wav_path.unlink(missing_ok=True)
            text_path.unlink(missing_ok=True)

    def _generate(self, wav_path: Path) -> Any:
        assert self._model is not None
        attempts = [
            {
                "input": str(wav_path),
                "batch_size_s": 60,
                "sentence_timestamp": True,
                "pred_timestamp": True,
            },
            {
                "input": str(wav_path),
                "batch_size_s": 60,
            },
        ]
        last_error: Exception | None = None
        for kwargs in attempts:
            try:
                return self._model.generate(**kwargs)
            except TypeError as exc:
                last_error = exc
                continue
        if last_error is not None:
            raise last_error
        raise RuntimeError("Paraformer generate failed without a descriptive error")

    @staticmethod
    def _configure_cache_env() -> None:
        cache_root = settings.AI_ASR_PROVIDER_CACHE_DIR.resolve()
        hf_home = cache_root / "huggingface"
        hf_hub_cache = hf_home / "hub"
        modelscope_cache = cache_root / "modelscope"
        hf_home.mkdir(parents=True, exist_ok=True)
        hf_hub_cache.mkdir(parents=True, exist_ok=True)
        modelscope_cache.mkdir(parents=True, exist_ok=True)
        os.environ.setdefault("HF_HOME", str(hf_home))
        os.environ.setdefault("HF_HUB_CACHE", str(hf_hub_cache))
        os.environ.setdefault("MODELSCOPE_CACHE", str(modelscope_cache))

    def _align_text(self, wav_path: Path, text_path: Path) -> list[list[float]] | None:
        if self._aligner is None:
            return None
        result = self._aligner.generate(
            input=(str(wav_path), str(text_path)),
            data_type=("sound", "text"),
        )
        return self._extract_timestamps(result)

    @staticmethod
    def _extract_text(raw: Any) -> str:
        entries = raw if isinstance(raw, list) else [raw]
        for entry in entries:
            if isinstance(entry, dict):
                text = str(entry.get("text", "")).strip()
                if text:
                    return text
        return ""

    def _extract_timestamps(self, raw: Any) -> list[list[float]] | None:
        entries = raw if isinstance(raw, list) else [raw]
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            parsed = self._parse_timestamps(
                entry.get("timestamp") or entry.get("timestamps")
            )
            if parsed:
                return parsed
        return None

    @staticmethod
    def _words_from_timestamps(
        text: str,
        segment: VADSegment,
        timestamps: list[list[float]] | None,
    ) -> list[Word]:
        tokens = [char for char in text if not char.isspace()]
        if not tokens:
            return []
        if not timestamps or len(timestamps) != len(tokens):
            duration = max(segment.duration, 0.001)
            step = duration / len(tokens)
            timestamps = [
                [
                    int(index * step * 1000),
                    int((index + 1) * step * 1000),
                ]
                for index in range(len(tokens))
            ]
        return [
            Word(
                word=token,
                start=round(segment.start + (float(start_ms) / 1000.0), 3),
                end=round(segment.start + (float(end_ms) / 1000.0), 3),
                confidence=0.88,
            )
            for token, (start_ms, end_ms) in zip(tokens, timestamps)
        ]

    @staticmethod
    def _parse_timestamps(value: Any) -> list[list[float]] | None:
        if value is None:
            return None
        if isinstance(value, str):
            try:
                value = ast.literal_eval(value)
            except (SyntaxError, ValueError):
                return None
        if not isinstance(value, list):
            return None
        parsed: list[list[float]] = []
        for item in value:
            if (
                isinstance(item, (list, tuple))
                and len(item) >= 2
                and all(isinstance(part, (int, float)) for part in item[:2])
            ):
                parsed.append([float(item[0]), float(item[1])])
        return parsed or None

    @staticmethod
    def _device_name() -> str:
        if settings.DEVICE == "cuda":
            return f"cuda:{settings.DEVICE_INDEX}"
        return settings.DEVICE
