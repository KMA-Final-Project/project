from __future__ import annotations

import gc
import re
import time
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Callable

import librosa
import numpy as np
from faster_whisper import BatchedInferencePipeline, WhisperModel
from loguru import logger

from src.config import settings
from src.core.asr.base import ASRProvider, ASRRouteConfig
from src.core.asr.phonetics import add_phonetic_annotations
from src.core.subtitle_text import build_sentence_text_from_words
from src.schemas import Sentence, VADSegment, Word


class WhisperASRProvider(ASRProvider):
    SILENCE_GAP_S = 0.3
    _HAN_RE = re.compile(r"[\u4e00-\u9fff]")
    _HIRAGANA_KATAKANA_RE = re.compile(r"[\u3040-\u30ff]")
    _HANGUL_RE = re.compile(r"[\uac00-\ud7af]")

    def __init__(self, route: ASRRouteConfig) -> None:
        self.route = route
        self._model: WhisperModel | None = None
        self._batched: BatchedInferencePipeline | None = None
        self.last_timing: dict[str, float] = {}
        self.last_diagnostics: dict[str, Any] = {}
        self.last_probe_details: dict[str, Any] = {}

    @staticmethod
    def _is_model_loaded(model: WhisperModel | None) -> bool:
        if model is None:
            return False
        ct2_model = getattr(model, "model", None)
        if ct2_model is None:
            return True
        return bool(getattr(ct2_model, "model_is_loaded", True))

    def ensure_loaded(self) -> None:
        if self._model is None:
            logger.info(
                f"Loading ASR route {self.route.route_id}: {self.route.model_id} "
                f"({settings.whisper_compute_type}, {settings.DEVICE})"
            )
            self._model = WhisperModel(
                self.route.model_id,
                device=settings.DEVICE,
                compute_type=settings.whisper_compute_type,
            )
            self._batched = BatchedInferencePipeline(model=self._model)
            logger.success(
                f"✅ ASR route loaded: {self.route.route_id} -> {self.route.model_id}"
            )
            return

        if not self._is_model_loaded(self._model):
            logger.info(f"Reloading ASR route {self.route.route_id} on {settings.DEVICE}")
            self._model.model.load_model(keep_cache=True)

        if self._batched is None:
            self._batched = BatchedInferencePipeline(model=self._model)

    def unload(self, *, to_cpu: bool = False) -> None:
        if self._model is None or not self._is_model_loaded(self._model):
            return
        logger.info(f"Unloading ASR route {self.route.route_id} from {settings.DEVICE}")
        self._model.model.unload_model(to_cpu=to_cpu)
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
        if not self.route.supports_probe or not segments:
            return None

        path = Path(file_path)
        if not path.exists() and audio_array is None:
            raise FileNotFoundError(f"Audio file not found: {path}")

        if audio_array is None:
            audio_full, _sample_rate = librosa.load(str(path), sr=16000)
        else:
            audio_full = audio_array.astype(np.float32, copy=False)

        limit_segments = max_segments or len(segments)
        probe_segments = self._select_probe_segments(segments, limit_segments)
        if not probe_segments:
            return None

        detected = self._vote_probe_language(
            audio_full,
            probe_segments,
            max_seconds=max_seconds,
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
        *,
        profile: str,
        on_chunk: Callable[[list[Sentence], int], None] | None,
        chunk_size: int,
        audio_array: np.ndarray | None = None,
        source_language: str | None = None,
    ) -> list[Sentence]:
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
            f"Starting ASR route {self.route.route_id} for {path.name} "
            f"({len(segments)} segments) | profile={profile}"
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
        anchor_language = self._initial_language(source_language)
        logprobs: list[float] = []
        compression_ratios: list[float] = []

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
            remapped_group: list[list[Sentence]] = [[] for _ in segment_group]
            primary_result: dict[str, Any] | None = None

            try:
                grouped_audio, offset_map = self._concatenate_audio(
                    audio_full, segment_group
                )
                if len(grouped_audio) < 160:
                    continue

                clip_ts = [
                    {
                        "start": float(mapping["concat_start"]),
                        "end": float(mapping["concat_end"]),
                    }
                    for mapping in offset_map
                ]

                transcribe_started_at = time.perf_counter()
                primary_result = self._transcribe_segment(
                    grouped_audio,
                    prompt,
                    language=anchor_language,
                    clip_timestamps=clip_ts,
                )
                best_segment = primary_result.get("best_segment")
                if best_segment is not None:
                    avg_logprob = getattr(best_segment, "avg_logprob", None)
                    compression_ratio = getattr(best_segment, "compression_ratio", None)
                    if isinstance(avg_logprob, (int, float)):
                        logprobs.append(float(avg_logprob))
                    if isinstance(compression_ratio, (int, float)):
                        compression_ratios.append(float(compression_ratio))
                stage_timing["transcription"] += (
                    time.perf_counter() - transcribe_started_at
                )

                remap_started_at = time.perf_counter()
                remapped_group = self._remap_timestamps(primary_result, offset_map)
                stage_timing["remap"] += time.perf_counter() - remap_started_at
            except Exception as exc:
                logger.warning(
                    f"ASR route {self.route.route_id} failed grouped transcription for "
                    f"group {group_index} ({len(segment_group)} segments): {exc}. "
                    "Retrying individually."
                )
                remapped_group, primary_result = self._fallback_transcribe_individual(
                    audio_full=audio_full,
                    segment_group=segment_group,
                    prompt=prompt,
                    language=anchor_language,
                    stage_timing=stage_timing,
                )

            detected_lang = self._update_detected_language(anchor_language, primary_result)
            if detected_lang and anchor_language is None:
                anchor_language = detected_lang

            output_language = detected_lang or anchor_language or ""
            for segment_sentences in remapped_group:
                for sentence in segment_sentences:
                    post_process_started_at = time.perf_counter()
                    self._split_cjk_words(sentence)
                    split_sentences = self._apply_silence_splitting(sentence)
                    stage_timing["post_proc"] += (
                        time.perf_counter() - post_process_started_at
                    )

                    if split_sentences:
                        previous_text_context += f" {split_sentences[-1].text}"
                        phoneme_started_at = time.perf_counter()
                        add_phonetic_annotations(split_sentences, output_language)
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
        self.last_diagnostics = {
            "avg_logprob": round(sum(logprobs) / len(logprobs), 4) if logprobs else None,
            "compression_ratio": round(
                sum(compression_ratios) / len(compression_ratios), 4
            )
            if compression_ratios
            else None,
            "detected_lang": anchor_language or "",
            "sentence_count": len(sentences),
        }

        logger.info(
            "⏱️ ASR route timing: "
            f"route={self.route.route_id}, "
            f"transcription={self.last_timing['transcription']:.3f}s, "
            f"phonemes={self.last_timing['phonemes']:.3f}s, "
            f"post_proc={self.last_timing['post_proc']:.3f}s, "
            f"overhead={self.last_timing['overhead']:.3f}s, "
            f"total={self.last_timing['total']:.3f}s"
        )
        return sentences

    def healthcheck(self) -> dict[str, Any]:
        return {
            "provider_id": self.route.provider_id,
            "route_id": self.route.route_id,
            "model_id": self.route.model_id,
            "loaded": self._is_model_loaded(self._model),
            "supports_probe": self.route.supports_probe,
            "during_asr_certified": self.route.during_asr_certified,
        }

    def _select_probe_segments(
        self,
        segments: list[VADSegment],
        limit_segments: int,
    ) -> list[VADSegment]:
        if not segments:
            return []

        limit = max(1, min(limit_segments, len(segments)))
        if limit >= len(segments):
            return list(segments[:limit])

        if limit == 1:
            return [segments[0]]

        selected_indices: list[int] = []
        last_index = len(segments) - 1
        for sample_index in range(limit):
            probe_index = round((sample_index * last_index) / (limit - 1))
            if probe_index not in selected_indices:
                selected_indices.append(probe_index)

        if len(selected_indices) < limit:
            for probe_index in range(len(segments)):
                if probe_index not in selected_indices:
                    selected_indices.append(probe_index)
                if len(selected_indices) >= limit:
                    break

        selected_indices.sort()
        return [segments[index] for index in selected_indices]

    def _vote_probe_language(
        self,
        audio_full: np.ndarray,
        probe_segments: list[VADSegment],
        *,
        max_seconds: float | None,
    ) -> str | None:
        if not probe_segments:
            return None

        per_segment_budget = None
        if max_seconds and max_seconds > 0:
            per_segment_budget = max_seconds / max(1, len(probe_segments))

        scores: dict[str, float] = {}
        last_seen: dict[str, int] = {}
        for index, segment in enumerate(probe_segments):
            detected, used_duration = self._probe_segment_language(
                audio_full,
                segment,
                max_seconds=per_segment_budget,
            )
            logger.debug(
                f"Probe sample {index + 1}/{len(probe_segments)} "
                f"{segment.start:.2f}s-{segment.end:.2f}s -> "
                f"{detected or 'unknown'} (used {used_duration:.2f}s)"
            )
            if not detected:
                continue
            scores[detected] = scores.get(detected, 0.0) + used_duration
            last_seen[detected] = index

        if not scores:
            self.last_probe_details = {
                "winner": "",
                "scores": {},
                "sample_count": len(probe_segments),
            }
            return None

        winner = max(
            scores,
            key=lambda lang: (
                scores[lang],
                1 if self._is_cjk_probe_language(lang) else 0,
                last_seen.get(lang, -1),
            ),
        )
        self.last_probe_details = {
            "winner": winner,
            "scores": {lang: round(value, 4) for lang, value in scores.items()},
            "sample_count": len(probe_segments),
        }
        logger.info(f"Probe language vote scores: {scores} -> {winner}")
        return winner

    def _probe_segment_language(
        self,
        audio_full: np.ndarray,
        segment: VADSegment,
        *,
        max_seconds: float | None,
    ) -> tuple[str | None, float]:
        start_sample = max(0, int(segment.start * 16000))
        budget_seconds = (
            min(float(segment.duration), max_seconds)
            if max_seconds is not None
            else float(segment.duration)
        )
        if budget_seconds <= 0:
            return None, 0.0

        end_sample = max(start_sample, int((segment.start + budget_seconds) * 16000))
        segment_audio = audio_full[start_sample:end_sample]
        if len(segment_audio) < 160:
            return None, 0.0

        result = self._transcribe_segment(
            segment_audio,
            self._construct_prompt("standard", ""),
            language=None,
        )
        detected = self._infer_probe_language(result)
        return detected or None, budget_seconds

    def _infer_probe_language(self, result: dict[str, Any]) -> str:
        text = " ".join(
            str(getattr(segment, "text", "") or "").strip()
            for segment in result.get("segments", [])
        ).strip()
        transcript_hint = self._infer_probe_language_from_text(text)
        if transcript_hint:
            return transcript_hint
        return settings.normalize_language_tag(
            getattr(result.get("info"), "language", None)
        )

    def _infer_probe_language_from_text(self, text: str) -> str:
        normalized_text = str(text or "").strip()
        if not normalized_text:
            return ""
        if self._HAN_RE.search(normalized_text):
            return "zh"
        if self._HIRAGANA_KATAKANA_RE.search(normalized_text):
            return "ja"
        if self._HANGUL_RE.search(normalized_text):
            return "ko"
        return ""

    @staticmethod
    def _is_cjk_probe_language(language: str) -> bool:
        normalized = settings.normalize_language_tag(language)
        if not normalized:
            return False
        base = normalized.split("-")[0]
        return normalized == "yue" or base in {"zh", "ja", "ko"}

    def _initial_language(self, source_language: str | None) -> str | None:
        normalized = settings.normalize_language_tag(source_language) or None
        if self.route.forced_language:
            return self.route.forced_language
        return normalized

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
            if getattr(res_seg, "no_speech_prob", 0.0) > 0.6 or not res_seg.words:
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
                        confidence=round(getattr(word, "probability", 0.0), 3),
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
        prompt: str,
        language: str | None,
        stage_timing: dict[str, float],
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
                segment_audio,
                prompt,
                language=language,
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

    def _update_detected_language(
        self,
        anchor_language: str | None,
        transcription_result: dict[str, Any] | None,
    ) -> str | None:
        if transcription_result is None:
            return anchor_language

        best_segment = transcription_result.get("best_segment")
        detected_lang = settings.normalize_language_tag(
            getattr(transcription_result.get("info"), "language", None)
        )

        if anchor_language is None and best_segment is not None and detected_lang:
            if getattr(best_segment, "avg_logprob", -1.0) > -0.5:
                logger.success(
                    f"⚓ Anchor language set: {detected_lang} "
                    f"(route={self.route.route_id}, conf={best_segment.avg_logprob:.2f})"
                )
                return detected_lang

        if anchor_language is not None and best_segment is not None:
            if (
                getattr(best_segment, "avg_logprob", 0.0) < -0.8
                or getattr(best_segment, "compression_ratio", 0.0) > 2.4
            ):
                logger.warning(
                    f"⚠️ Low confidence on route {self.route.route_id} "
                    f"(avg_logprob={best_segment.avg_logprob:.2f})"
                )

        return detected_lang or anchor_language

    def _transcribe_segment(
        self,
        audio: np.ndarray,
        prompt: str,
        *,
        language: str | None,
        clip_timestamps: list[dict[str, float]] | None = None,
    ) -> dict[str, Any]:
        self.ensure_loaded()
        assert self._batched is not None

        beam_size = 1 if self.route.greedy_only else settings.whisper_beam_size
        if clip_timestamps is None:
            duration = len(audio) / 16000.0
            clip_timestamps = [{"start": 0.0, "end": duration}]

        effective_language = self.route.forced_language or language
        gen, info = self._batched.transcribe(
            audio,
            batch_size=settings.batch_size,
            beam_size=beam_size,
            word_timestamps=True,
            condition_on_previous_text=self.route.condition_on_previous_text,
            initial_prompt=prompt,
            language=effective_language,
            vad_filter=False,
            clip_timestamps=clip_timestamps,
        )
        segments = list(gen)
        best_segment = (
            max(
                segments,
                key=lambda segment: getattr(segment, "avg_logprob", float("-inf")),
            )
            if segments
            else None
        )
        return {"segments": segments, "info": info, "best_segment": best_segment}

    @staticmethod
    def _construct_prompt(profile: str, prev_context: str) -> str:
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
                char_duration = duration / len(chars) if chars else 0.0
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
                    sub_sentences.append(self._create_sentence_from_words(current_words))
                current_words = [current_word]
            else:
                current_words.append(current_word)

        if current_words:
            sub_sentences.append(self._create_sentence_from_words(current_words))

        return sub_sentences

    @staticmethod
    def _create_sentence_from_words(words: list[Word]) -> Sentence:
        text = build_sentence_text_from_words(words)
        return Sentence(text=text, start=words[0].start, end=words[-1].end, words=words)
