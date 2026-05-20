"""
Smart Aligner Module
====================
The 'Heart' of the system.
Responsible for high-precision transcription using Faster-Whisper (Large-v3).
Aligns text with VAD segments and ensures word-level timestamps for Karaoke.
"""

from __future__ import annotations

import gc
import re
import time
from pathlib import Path
from typing import Any, Callable

import eng_to_ipa
import librosa
import numpy as np
import pypinyin
from faster_whisper import BatchedInferencePipeline, WhisperModel
from loguru import logger

from src.config import settings
from src.core.subtitle_text import build_sentence_text_from_words
from src.schemas import Sentence, VADSegment, Word


class SmartAligner:
    """
    Singleton class for transcription and alignment.

    Supports dual-model architecture:
      - Turbo model (large-v3-turbo): fast, for EN/VI and common languages
      - Full model  (large-v3):       accurate, for CJK languages

    Model loading is lazy and controlled by WORKER_MODEL_MODE:
      - "auto"       → turbo or full may be loaded per job
      - "turbo_only" → only turbo may be loaded
      - "full_only"  → only full may be loaded
    """

    SILENCE_GAP_S = 0.3

    _instance = None
    _initialized: bool = False

    _model_turbo: WhisperModel | None = None
    _model_full: WhisperModel | None = None
    _batched_turbo: BatchedInferencePipeline | None = None
    _batched_full: BatchedInferencePipeline | None = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(SmartAligner, cls).__new__(cls)
        return cls._instance

    def __init__(self):
        if self._initialized:
            return

        self._initialized = True
        self.last_timing: dict[str, float] = {}
        logger.success(
            f"SmartAligner ready | mode={settings.WORKER_MODEL_MODE.lower()} | "
            "lazy_load=enabled"
        )

    @staticmethod
    def _allowed_routes() -> tuple[str, ...]:
        mode = settings.WORKER_MODEL_MODE.lower()
        if mode == "turbo_only":
            return ("turbo",)
        if mode == "full_only":
            return ("full",)
        return ("turbo", "full")

    @staticmethod
    def route_for_language(language: str | None) -> str:
        normalized = settings.normalize_language_tag(language)
        if not normalized:
            return "turbo"

        base = normalized.split("-")[0]
        if normalized == "yue" or base in {"zh", "ja", "ko"}:
            return "full"
        if normalized in {
            settings.normalize_language_tag(code)
            for code in settings.WHISPER_CJK_LANGUAGES
        }:
            return "full"
        return "turbo"

    def resolve_route(self, route: str) -> str:
        requested = route.strip().lower()
        allowed = self._allowed_routes()
        if requested in allowed:
            return requested

        fallback = allowed[0]
        logger.warning(
            f"Requested ASR route '{requested}' is not available in "
            f"WORKER_MODEL_MODE={settings.WORKER_MODEL_MODE}; falling back to '{fallback}'"
        )
        return fallback

    @staticmethod
    def _is_model_loaded(model: WhisperModel | None) -> bool:
        if model is None:
            return False
        ct2_model = getattr(model, "model", None)
        if ct2_model is None:
            return True
        return bool(getattr(ct2_model, "model_is_loaded", True))

    def _get_route_state(
        self, route: str
    ) -> tuple[WhisperModel | None, BatchedInferencePipeline | None]:
        if route == "full":
            return self._model_full, self._batched_full
        return self._model_turbo, self._batched_turbo

    def _set_route_state(
        self,
        route: str,
        *,
        model: WhisperModel | None = None,
        batched: BatchedInferencePipeline | None = None,
    ) -> None:
        if route == "full":
            if model is not None:
                self._model_full = model
            if batched is not None:
                self._batched_full = batched
            return
        if model is not None:
            self._model_turbo = model
        if batched is not None:
            self._batched_turbo = batched

    @staticmethod
    def _load_model(model_name: str, compute_type: str, label: str) -> WhisperModel:
        logger.info(
            f"Loading {label} model: {model_name} ({compute_type}, {settings.DEVICE})"
        )
        model = WhisperModel(
            model_name,
            device=settings.DEVICE,
            compute_type=compute_type,
        )
        logger.success(f"✅ {label} model loaded: {model_name}")
        return model

    def ensure_route_loaded(self, route: str) -> str:
        resolved = self.resolve_route(route)
        model, batched = self._get_route_state(resolved)

        if model is None:
            model_name = (
                settings.WHISPER_MODEL_FULL
                if resolved == "full"
                else settings.WHISPER_MODEL_TURBO
            )
            model = self._load_model(
                model_name,
                settings.whisper_compute_type,
                resolved,
            )
            batched = BatchedInferencePipeline(model=model)
            self._set_route_state(resolved, model=model, batched=batched)
            return resolved

        if not self._is_model_loaded(model):
            logger.info(f"Reloading {resolved} model on {settings.DEVICE}")
            model.model.load_model(keep_cache=True)

        if batched is None:
            batched = BatchedInferencePipeline(model=model)
            self._set_route_state(resolved, batched=batched)

        return resolved

    def _unload_route_state(self, route: str, *, to_cpu: bool = False) -> str:
        model, _batched = self._get_route_state(route)
        if model is None or not self._is_model_loaded(model):
            return route

        logger.info(f"Unloading {route} model from {settings.DEVICE}")
        model.model.unload_model(to_cpu=to_cpu)
        gc.collect()
        return route

    def unload_route(self, route: str, *, to_cpu: bool = False) -> str:
        return self._unload_route_state(self.resolve_route(route), to_cpu=to_cpu)

    def unload_all(self, *, to_cpu: bool = False) -> None:
        for route in ("turbo", "full"):
            self._unload_route_state(route, to_cpu=to_cpu)

    def _select_batched_for_route(
        self, route: str
    ) -> tuple[BatchedInferencePipeline, bool]:
        resolved = self.ensure_route_loaded(route)
        _model, batched = self._get_route_state(resolved)
        if batched is None:
            raise RuntimeError(
                f"No batched pipeline available for route '{resolved}'"
            )
        return batched, resolved == "turbo"

    def _select_batched(
        self, language: str | None
    ) -> tuple[BatchedInferencePipeline, bool]:
        """Select the batched pipeline for the given language.

        Returns:
            Tuple of (pipeline, is_turbo) — is_turbo=True when the turbo model is selected.
        """
        return self._select_batched_for_route(self.route_for_language(language))

    def probe_source_language(
        self,
        file_path: Path | str,
        segments: list[VADSegment],
        *,
        audio_array: np.ndarray | None = None,
        max_segments: int | None = None,
        max_seconds: float | None = None,
    ) -> str | None:
        """Probe early speech with the fast ASR route to infer source language."""
        if not segments:
            return None

        path = Path(file_path)
        if not path.exists() and audio_array is None:
            raise FileNotFoundError(f"Audio file not found: {path}")

        if audio_array is None:
            audio_full, _sample_rate = librosa.load(str(path), sr=16000)
        else:
            audio_full = audio_array.astype(np.float32, copy=False)

        probe_segments: list[VADSegment] = []
        covered_seconds = 0.0
        limit_segments = max_segments or len(segments)

        for segment in segments[:limit_segments]:
            probe_segments.append(segment)
            covered_seconds += float(segment.duration)
            if max_seconds and covered_seconds >= max_seconds:
                break

        if not probe_segments:
            return None

        batched, is_turbo = self._select_batched_for_route("turbo")
        grouped_audio, offset_map = self._concatenate_audio(audio_full, probe_segments)
        if len(grouped_audio) < 160 or not offset_map:
            return None

        clip_ts = [
            {
                "start": float(mapping["concat_start"]),
                "end": float(mapping["concat_end"]),
            }
            for mapping in offset_map
        ]
        result = self._transcribe_segment(
            batched,
            grouped_audio,
            self._construct_prompt("standard", ""),
            language=None,
            clip_timestamps=clip_ts,
            is_turbo=is_turbo,
        )
        detected = settings.normalize_language_tag(
            getattr(result.get("info"), "language", None)
        )
        if detected:
            logger.info(
                f"Source-language probe detected '{detected}' from "
                f"{len(probe_segments)} segment(s)"
            )
        return detected or None

    def process(
        self,
        file_path: Path | str,
        segments: list[VADSegment],
        profile: str = "standard",
        on_chunk: Callable[[list[Sentence], int], None] | None = None,
        chunk_size: int = 20,
        audio_array: np.ndarray | None = None,
        source_language: str | None = None,
        route_override: str | None = None,
    ) -> list[Sentence]:
        """
        Transcribe audio with Dynamic Anchor Strategy and Advanced Prompting.

        Args:
            on_chunk: Optional callback fired every `chunk_size` sentences.
                      Signature: on_chunk(batch: List[Sentence], total_so_far: int)
                      Enables streaming uploads while transcription continues.
            chunk_size: Number of sentences to accumulate before firing on_chunk.
            audio_array: Optional preloaded 16kHz mono audio from VADManager.
            source_language: Optional ISO language tag used to anchor Whisper.
            route_override: Optional explicit ASR route ("turbo" or "full").
        """
        started_at = time.perf_counter()
        stage_timing = {
            "audio_load": 0.0,
            "transcription": 0.0,
            "phonemes": 0.0,
            "post_proc": 0.0,
            "remap": 0.0,
        }

        path = Path(file_path)
        if not path.exists() and audio_array is None:
            raise FileNotFoundError(f"Audio file not found: {path}")

        if not segments:
            self.last_timing = {
                "transcription": 0.0,
                "phonemes": 0.0,
                "post_proc": 0.0,
                "overhead": 0.0,
                "total": 0.0,
            }
            return []

        logger.info(
            f"Starting Smart Alignment for: {path.name} ({len(segments)} segments) | Profile: {profile}"
        )

        if audio_array is None:
            audio_load_started_at = time.perf_counter()
            audio_full, _sample_rate = librosa.load(str(path), sr=16000)
            stage_timing["audio_load"] += time.perf_counter() - audio_load_started_at
        else:
            audio_full = audio_array.astype(np.float32, copy=False)

        sentences: list[Sentence] = []
        pending_chunk: list[Sentence] = []
        previous_text_context = ""
        anchor_language: str | None = (
            settings.normalize_language_tag(source_language) or None
        )

        def _flush_if_ready() -> None:
            nonlocal pending_chunk
            if on_chunk and len(pending_chunk) >= chunk_size:
                while len(pending_chunk) >= chunk_size:
                    batch = pending_chunk[:chunk_size]
                    pending_chunk = pending_chunk[chunk_size:]
                    on_chunk(batch, len(sentences))

        for group_index, segment_group in enumerate(
            self._group_segments(segments), start=1
        ):
            prompt = self._construct_prompt(profile, previous_text_context)
            current_lang = anchor_language
            batched, is_turbo = (
                self._select_batched_for_route(route_override)
                if route_override
                else self._select_batched(current_lang)
            )

            remapped_group: list[list[Sentence]] = [[] for _ in segment_group]
            primary_result: dict[str, Any] | None = None

            try:
                grouped_audio, offset_map = self._concatenate_audio(
                    audio_full, segment_group
                )
                if len(grouped_audio) < 160:
                    continue

                # Build clip_timestamps from offset_map so BatchedInferencePipeline
                # knows where each VAD segment starts/ends in the concatenated audio.
                # BatchedInferencePipeline expects List[dict] with "start"/"end" keys.
                clip_ts: list[dict] = []
                for mapping in offset_map:
                    clip_ts.append(
                        {
                            "start": float(mapping["concat_start"]),
                            "end": float(mapping["concat_end"]),
                        }
                    )

                transcribe_started_at = time.perf_counter()
                primary_result = self._transcribe_segment(
                    batched,
                    grouped_audio,
                    prompt,
                    language=current_lang,
                    clip_timestamps=clip_ts,
                    is_turbo=is_turbo,
                )
                stage_timing["transcription"] += (
                    time.perf_counter() - transcribe_started_at
                )

                remap_started_at = time.perf_counter()
                remapped_group = self._remap_timestamps(primary_result, offset_map)
                stage_timing["remap"] += time.perf_counter() - remap_started_at
            except Exception as exc:
                logger.warning(
                    f"Grouped transcription failed for SmartAligner group {group_index} "
                    f"({len(segment_group)} segments): {exc}. Retrying individually."
                )
                remapped_group, primary_result = self._fallback_transcribe_individual(
                    audio_full=audio_full,
                    segment_group=segment_group,
                    batched=batched,
                    prompt=prompt,
                    language=current_lang,
                    stage_timing=stage_timing,
                    is_turbo=is_turbo,
                )

            detected_lang = self._update_anchor_language(
                anchor_language, primary_result
            )
            if detected_lang and anchor_language is None:
                anchor_language = detected_lang

            output_language = detected_lang or anchor_language or ""
            for segment_sentences in remapped_group:
                for sentence in segment_sentences:
                    post_process_started_at = time.perf_counter()
                    self._split_cjk_words(sentence)
                    # SmartAligner owns acoustic/word-timestamp alignment only.
                    # Semantic regrouping happens downstream in the pipeline consumer.
                    split_sentences = self._apply_silence_splitting(sentence)
                    stage_timing["post_proc"] += (
                        time.perf_counter() - post_process_started_at
                    )

                    if split_sentences:
                        previous_text_context += f" {split_sentences[-1].text}"
                        phoneme_started_at = time.perf_counter()
                        self._add_phonemes(split_sentences, output_language)
                        stage_timing["phonemes"] += (
                            time.perf_counter() - phoneme_started_at
                        )
                        for aligned_sentence in split_sentences:
                            aligned_sentence.detected_lang = output_language

                    sentences.extend(split_sentences)
                    pending_chunk.extend(split_sentences)
                    _flush_if_ready()

        if on_chunk and pending_chunk:
            on_chunk(pending_chunk, len(sentences))

        total_elapsed = time.perf_counter() - started_at
        accounted = (
            stage_timing["audio_load"]
            + stage_timing["transcription"]
            + stage_timing["phonemes"]
            + stage_timing["post_proc"]
            + stage_timing["remap"]
        )
        overhead = max(0.0, total_elapsed - accounted)
        self.last_timing = {
            "transcription": round(stage_timing["transcription"], 3),
            "phonemes": round(stage_timing["phonemes"], 3),
            "post_proc": round(stage_timing["post_proc"] + stage_timing["remap"], 3),
            "overhead": round(overhead, 3),
            "total": round(total_elapsed, 3),
        }

        logger.info(
            "⏱️ SmartAligner: "
            f"transcription={self.last_timing['transcription']:.3f}s, "
            f"phonemes={self.last_timing['phonemes']:.3f}s, "
            f"post_proc={self.last_timing['post_proc']:.3f}s, "
            f"overhead={self.last_timing['overhead']:.3f}s, "
            f"total={self.last_timing['total']:.3f}s"
        )
        logger.success(f"Alignment Complete. Generated {len(sentences)} sentences.")
        return sentences

    def _group_segments(self, segments: list[VADSegment]) -> list[list[VADSegment]]:
        group_size = max(1, settings.SMART_ALIGNER_GROUP_SIZE)
        return [
            segments[index : index + group_size]
            for index in range(0, len(segments), group_size)
        ]

    def _concatenate_audio(
        self,
        audio_full: np.ndarray,
        segment_group: list[VADSegment],
    ) -> tuple[np.ndarray, list[dict[str, float | VADSegment]]]:
        gap_samples = int(self.SILENCE_GAP_S * 16000)
        silence_gap = np.zeros(gap_samples, dtype=np.float32)
        parts: list[np.ndarray] = []
        offset_map: list[dict[str, float | VADSegment]] = []
        cursor_samples = 0

        for index, segment in enumerate(segment_group):
            start_sample = max(0, int(segment.start * 16000))
            end_sample = max(start_sample, int(segment.end * 16000))
            segment_audio = audio_full[start_sample:end_sample]
            if segment_audio.size == 0:
                continue

            concat_start = cursor_samples / 16000.0
            concat_end = concat_start + (len(segment_audio) / 16000.0)
            offset_map.append(
                {
                    "vad_segment": segment,
                    "concat_start": concat_start,
                    "concat_end": concat_end,
                }
            )
            parts.append(segment_audio.astype(np.float32, copy=False))
            cursor_samples += len(segment_audio)

            if index < len(segment_group) - 1:
                parts.append(silence_gap)
                cursor_samples += len(silence_gap)

        if not parts:
            return np.array([], dtype=np.float32), offset_map

        return np.concatenate(parts), offset_map

    def _remap_timestamps(
        self,
        result: dict[str, Any],
        offset_map: list[dict[str, float | VADSegment]],
    ) -> list[list[Sentence]]:
        remapped_sentences: list[list[Sentence]] = [[] for _ in offset_map]

        for res_seg in result["segments"]:
            if res_seg.no_speech_prob > 0.6 or not res_seg.words:
                continue

            grouped_words: dict[int, list[Word]] = {}
            for word in res_seg.words:
                token = word.word.strip()
                if not token:
                    continue

                target_index = self._find_offset_index(word.start, word.end, offset_map)
                if target_index is None:
                    continue

                mapping = offset_map[target_index]
                vad_segment = mapping["vad_segment"]
                assert isinstance(vad_segment, VADSegment)
                concat_start = float(mapping["concat_start"])

                relative_start = max(0.0, word.start - concat_start)
                relative_end = min(vad_segment.duration, word.end - concat_start)
                grouped_words.setdefault(target_index, []).append(
                    Word(
                        word=token,
                        start=round(vad_segment.start + relative_start, 3),
                        end=round(vad_segment.start + relative_end, 3),
                        confidence=round(word.probability, 3),
                    )
                )

            for target_index, words in grouped_words.items():
                if not words:
                    continue
                remapped_sentences[target_index].append(
                    self._create_sentence_from_words(words)
                )

        return remapped_sentences

    def _find_offset_index(
        self,
        word_start: float,
        word_end: float,
        offset_map: list[dict[str, float | VADSegment]],
    ) -> int | None:
        midpoint = (word_start + word_end) / 2
        for index, mapping in enumerate(offset_map):
            concat_start = float(mapping["concat_start"])
            concat_end = float(mapping["concat_end"])
            if concat_start <= midpoint <= concat_end:
                return index
        return None

    def _fallback_transcribe_individual(
        self,
        *,
        audio_full: np.ndarray,
        segment_group: list[VADSegment],
        batched: BatchedInferencePipeline,
        prompt: str,
        language: str | None,
        stage_timing: dict[str, float],
        is_turbo: bool = False,
    ) -> tuple[list[list[Sentence]], dict[str, Any] | None]:
        remapped_group: list[list[Sentence]] = [[] for _ in segment_group]
        primary_result: dict[str, Any] | None = None

        for index, segment in enumerate(segment_group):
            start_sample = max(0, int(segment.start * 16000))
            end_sample = max(start_sample, int(segment.end * 16000))
            segment_audio = audio_full[start_sample:end_sample]
            if len(segment_audio) < 160:
                continue

            transcribe_started_at = time.perf_counter()
            segment_result = self._transcribe_segment(
                batched,
                segment_audio,
                prompt,
                language=language,
                is_turbo=is_turbo,
            )
            stage_timing["transcription"] += time.perf_counter() - transcribe_started_at

            if primary_result is None:
                primary_result = segment_result

            remap_started_at = time.perf_counter()
            remapped = self._remap_timestamps(
                segment_result,
                [
                    {
                        "vad_segment": segment,
                        "concat_start": 0.0,
                        "concat_end": segment.duration,
                    }
                ],
            )
            stage_timing["remap"] += time.perf_counter() - remap_started_at
            remapped_group[index] = remapped[0]

        return remapped_group, primary_result

    def _update_anchor_language(
        self,
        anchor_language: str | None,
        transcription_result: dict[str, Any] | None,
    ) -> str | None:
        if transcription_result is None:
            return anchor_language

        best_segment = transcription_result.get("best_segment")
        detected_lang = getattr(transcription_result.get("info"), "language", None)

        if anchor_language is None and best_segment is not None and detected_lang:
            if best_segment.avg_logprob > -0.5:
                selected = (
                    "full"
                    if detected_lang in settings.WHISPER_CJK_LANGUAGES
                    else "turbo"
                )
                logger.success(
                    f"⚓ Anchor Language Set: {detected_lang} "
                    f"(Conf: {best_segment.avg_logprob:.2f}) → using {selected} model"
                )
                return detected_lang

        if anchor_language is not None and best_segment is not None:
            if best_segment.avg_logprob < -0.8 or best_segment.compression_ratio > 2.4:
                logger.warning(
                    f"⚠️ Low confidence with Anchor ({best_segment.avg_logprob:.2f})."
                )

        return detected_lang or anchor_language

    def _transcribe_segment(
        self,
        batched: BatchedInferencePipeline,
        audio: np.ndarray,
        prompt: str,
        language: str | None,
        clip_timestamps: list[dict] | None = None,
        is_turbo: bool = False,
    ) -> dict[str, Any]:
        # Turbo model is optimised for greedy decoding; beam search adds
        # latency with negligible quality gain.  Use beam=1 for turbo.
        beam_size = 1 if is_turbo else settings.whisper_beam_size

        # BatchedInferencePipeline expects clip_timestamps as List[dict]
        # with "start"/"end" keys.  When none supplied, cover the full audio.
        if clip_timestamps is None:
            duration = len(audio) / 16000.0
            clip_timestamps = [{"start": 0.0, "end": duration}]

        gen, info = batched.transcribe(
            audio,
            batch_size=settings.batch_size,
            beam_size=beam_size,
            word_timestamps=True,
            condition_on_previous_text=False,
            initial_prompt=prompt,
            language=language,
            vad_filter=False,
            clip_timestamps=clip_timestamps,
        )
        segments = list(gen)
        best_segment = (
            max(segments, key=lambda segment: segment.avg_logprob) if segments else None
        )
        return {"segments": segments, "info": info, "best_segment": best_segment}

    def _construct_prompt(self, profile: str, prev_context: str) -> str:
        if profile == "music":
            genre = "Genre: Lyrics, Song, Ancient/Xianxia context."
        else:
            genre = "Genre: General speech, Interview, Conversation."

        context = prev_context[-200:].strip() if prev_context else ""
        return f"{genre} Previous context: {context}"

    def _split_cjk_words(self, sentence: Sentence) -> None:
        new_words: list[Word] = []
        cjk_pattern = re.compile(r"[\u4e00-\u9fff]")

        for word in sentence.words:
            if len(word.word) > 1 and cjk_pattern.search(word.word):
                chars = list(word.word)
                duration = word.end - word.start
                char_duration = duration / len(chars)

                for index, char in enumerate(chars):
                    char_start = word.start + (index * char_duration)
                    char_end = word.start + ((index + 1) * char_duration)
                    new_words.append(
                        Word(
                            word=char,
                            start=round(char_start, 3),
                            end=round(char_end, 3),
                            confidence=word.confidence,
                        )
                    )
            else:
                new_words.append(word)

        sentence.words = new_words

    def _apply_silence_splitting(self, sentence: Sentence) -> list[Sentence]:
        if not sentence.words:
            return [sentence]

        sub_sentences: list[Sentence] = []
        current_words = [sentence.words[0]]

        for index in range(1, len(sentence.words)):
            previous_word = sentence.words[index - 1]
            current_word = sentence.words[index]
            gap = current_word.start - previous_word.end

            if gap > settings.SILENCE_SPLIT_GAP:
                if current_words:
                    sub_sentences.append(
                        self._create_sentence_from_words(current_words)
                    )
                current_words = [current_word]
            else:
                current_words.append(current_word)

        if current_words:
            sub_sentences.append(self._create_sentence_from_words(current_words))

        return sub_sentences

    def _create_sentence_from_words(self, words: list[Word]) -> Sentence:
        text = build_sentence_text_from_words(words)
        return Sentence(text=text, start=words[0].start, end=words[-1].end, words=words)

    def _add_phonemes(self, sentences: list[Sentence], language: str) -> None:
        if language not in ["zh", "en"]:
            return

        for sentence in sentences:
            for word in sentence.words:
                text = word.word.strip()
                if not text:
                    continue

                try:
                    if language == "zh":
                        if re.search(r"[\u4e00-\u9fff]", text):
                            pinyin = pypinyin.pinyin(
                                text,
                                style=pypinyin.Style.TONE,
                                heteronym=False,
                            )
                            word.phoneme = "".join(item[0] for item in pinyin)
                    elif language == "en":
                        ipa = eng_to_ipa.convert(text)
                        if ipa and "*" not in ipa:
                            word.phoneme = ipa
                except Exception as exc:
                    logger.warning(f"Phonetic error for '{text}': {exc}")

            sentence.phonetic = " ".join(
                phoneme.strip()
                for phoneme in (current.phoneme for current in sentence.words)
                if phoneme and phoneme.strip()
            )
