"""
Smart Aligner Module
====================
The 'Heart' of the system.
Responsible for high-precision transcription using Faster-Whisper (Large-v3).
Aligns text with VAD segments and ensures word-level timestamps for Karaoke.
"""

from __future__ import annotations

import torch
import numpy as np
import librosa
from pathlib import Path
from typing import List, Optional, Callable
import re # moved up for reuse

# Phonetics
import pypinyin
import eng_to_ipa

from loguru import logger
from faster_whisper import WhisperModel, BatchedInferencePipeline

from src.config import settings
from src.schemas import VADSegment, Sentence, Word


class SmartAligner:
    """
    Singleton class for transcription and alignment.

    Supports dual-model architecture:
      - Turbo model (large-v3-turbo): fast, for EN/VI and common languages
      - Full model  (large-v3):       accurate, for CJK languages

    Model loading is controlled by WORKER_MODEL_MODE:
      - "auto"       → both models loaded (~8 GB VRAM)
      - "turbo_only" → only turbo loaded  (~3 GB VRAM)
      - "full_only"  → only full loaded   (~5 GB VRAM)
    """
    _instance = None
    _initialized: bool = False

    # Model slots — filled based on WORKER_MODEL_MODE
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

        mode = settings.WORKER_MODEL_MODE.lower()
        compute_type = settings.whisper_compute_type

        if mode in ("auto", "turbo_only"):
            self._model_turbo = self._load_model(
                settings.WHISPER_MODEL_TURBO, compute_type, "turbo"
            )
            self._batched_turbo = BatchedInferencePipeline(model=self._model_turbo)

        if mode in ("auto", "full_only"):
            self._model_full = self._load_model(
                settings.WHISPER_MODEL_FULL, compute_type, "full"
            )
            self._batched_full = BatchedInferencePipeline(model=self._model_full)

        logger.success(
            f"SmartAligner ready | mode={mode} | "
            f"turbo={'✅' if self._model_turbo else '—'} | "
            f"full={'✅' if self._model_full else '—'}"
        )

    @staticmethod
    def _load_model(model_name: str, compute_type: str, label: str) -> WhisperModel:
        """Load a single WhisperModel onto the configured device."""
        logger.info(f"Loading {label} model: {model_name} ({compute_type}, {settings.DEVICE})")
        model = WhisperModel(
            model_name,
            device=settings.DEVICE,
            compute_type=compute_type,
        )
        logger.success(f"✅ {label} model loaded: {model_name}")
        return model

    def _select_model(self, language: str | None) -> WhisperModel:
        """
        Pick the right model for the detected/anchor language.

        CJK languages → full model (if loaded)
        Everything else → turbo model (if loaded)
        If only one model is loaded, always use that one.
        """
        need_full = language in settings.WHISPER_CJK_LANGUAGES

        if need_full and self._model_full:
            return self._model_full
        if self._model_turbo:
            return self._model_turbo
        if self._model_full:
            return self._model_full

        raise RuntimeError("No Whisper model loaded — check WORKER_MODEL_MODE")

    def _select_batched(self, language: str | None) -> BatchedInferencePipeline:
        """Pick the batched pipeline matching _select_model logic."""
        need_full = language in settings.WHISPER_CJK_LANGUAGES

        if need_full and self._batched_full:
            return self._batched_full
        if self._batched_turbo:
            return self._batched_turbo
        if self._batched_full:
            return self._batched_full

        raise RuntimeError("No batched pipeline available — check WORKER_MODEL_MODE")

    def process(
        self,
        file_path: Path | str,
        segments: List[VADSegment],
        profile: str = "standard",
        on_chunk: Callable[[List[Sentence], int], None] | None = None,
        chunk_size: int = 20,
    ) -> List[Sentence]:
        """
        Transcribe audio with Dynamic Anchor Strategy and Advanced Prompting.

        Args:
            on_chunk: Optional callback fired every `chunk_size` sentences.
                      Signature: on_chunk(batch: List[Sentence], total_so_far: int)
                      Enables streaming uploads while transcription continues.
            chunk_size: Number of sentences to accumulate before firing on_chunk.
        """
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"Audio file not found: {path}")

        logger.info(f"Starting Smart Alignment for: {path.name} ({len(segments)} segments) | Profile: {profile}")

        # Loading audio (16kHz mono)
        audio_full, sr = librosa.load(str(path), sr=16000)
        
        sentences: List[Sentence] = []
        pending_chunk: List[Sentence] = []  # Buffer for streaming
        previous_text_context = "" 
        
        # Pillar 1: Anchor Language State
        anchor_language: str | None = None
        
        logger.debug(f"Processing {len(segments)} VAD segments...")
        
        def _flush_if_ready():
            """Flush pending sentences to callback if we have enough."""
            nonlocal pending_chunk
            if on_chunk and len(pending_chunk) >= chunk_size:
                # Flush full chunks
                while len(pending_chunk) >= chunk_size:
                    batch = pending_chunk[:chunk_size]
                    pending_chunk = pending_chunk[chunk_size:]
                    on_chunk(batch, len(sentences))
        
        for i, seg in enumerate(segments):
            logger.debug(f"--- Segment {i+1}: {seg.start:.2f}s -> {seg.end:.2f}s ---")
            start_sample = int(seg.start * 16000)
            end_sample = int(seg.end * 16000)
            
            if start_sample >= len(audio_full): break
            audio_segment = audio_full[start_sample:end_sample]
            if len(audio_segment) < 160: continue
                
            # --- Pillar 2: Dynamic Prompt Injection ---
            prompt = self._construct_prompt(profile, previous_text_context)
            
            # --- Pillar 1: Language Strategy ---
            current_lang = anchor_language  # None if not set
            batched = self._select_batched(current_lang)
            
            transcription_result = self._transcribe_segment(
                batched, audio_segment, prompt, language=current_lang
            )
            
            # Logic: Anchor Detection & Fallback
            if anchor_language is None:
                best_segment = transcription_result["best_segment"]
                if best_segment and best_segment.avg_logprob > -0.5:
                    anchor_language = transcription_result["info"].language
                    selected = "full" if anchor_language in settings.WHISPER_CJK_LANGUAGES else "turbo"
                    logger.success(
                        f"⚓ Anchor Language Set: {anchor_language} "
                        f"(Conf: {best_segment.avg_logprob:.2f}) → using {selected} model"
                    )
            else:
                best_segment = transcription_result["best_segment"]
                if best_segment and (best_segment.avg_logprob < -0.8 or best_segment.compression_ratio > 2.4):
                    logger.warning(f"⚠️ Low confidence with Anchor ({best_segment.avg_logprob:.2f}). Retrying with Auto-Detect...")
                    fallback_result = self._transcribe_segment(
                         batched, audio_segment, prompt, language=None
                    )
                    transcription_result = fallback_result
            
            # Extract Results
            res_sentences = self._process_transcription_result(transcription_result, seg)
            
            # --- Pillar 3 & 4: Post-Processing ---
            for sent in res_sentences:
                self._split_cjk_words(sent)
                split_sents = self._apply_silence_splitting(sent)
                
                if split_sents:
                    previous_text_context += " " + split_sents[-1].text
                    detected_lang = transcription_result["info"].language
                    self._add_phonemes(split_sents, detected_lang)
                    
                sentences.extend(split_sents)
                pending_chunk.extend(split_sents)
            
            # Check if we should flush a chunk
            _flush_if_ready()

        # Flush any remaining sentences
        if on_chunk and pending_chunk:
            on_chunk(pending_chunk, len(sentences))
            pending_chunk = []

        logger.success(f"Alignment Complete. Generated {len(sentences)} sentences.")
        return sentences

    def _transcribe_segment(self, batched: BatchedInferencePipeline, audio, prompt, language):
        """Run transcription using the batched pipeline for throughput."""
        gen, info = batched.transcribe(
            audio,
            batch_size=settings.batch_size,
            beam_size=settings.whisper_beam_size,
            word_timestamps=True,
            condition_on_previous_text=False,
            initial_prompt=prompt,
            language=language,
            vad_filter=False,  # We already ran Silero VAD upstream
        )
        segments = list(gen)
        best = max(segments, key=lambda s: s.avg_logprob) if segments else None
        
        return {"segments": segments, "info": info, "best_segment": best}

    def _construct_prompt(self, profile: str, prev_context: str) -> str:
        """Pillar 2: Construct prompt based on profile."""
        if profile == "music":
            genre = "Genre: Lyrics, Song, Ancient/Xianxia context."
        else:
            genre = "Genre: General speech, Interview, Conversation."
            
        context = prev_context[-200:].strip() if prev_context else ""
        return f"{genre} Previous context: {context}"

    def _process_transcription_result(self, result, vad_seg: VADSegment) -> List[Sentence]:
        """Convert Whisper segments to Schema Sentences."""
        sentences = []
        processed_sigs = set()
        
        for res_seg in result["segments"]:
            # Basic Filters
            if res_seg.no_speech_prob > 0.6: continue
            
            words = []
            if res_seg.words:
                for w in res_seg.words:
                    words.append(Word(
                        word=w.word,
                        start=round(vad_seg.start + w.start, 3),
                        end=round(vad_seg.start + w.end, 3),
                        confidence=round(w.probability, 3)
                    ))
            
            if words:
                 # Deduplication Check
                 sig = (res_seg.text.strip(), words[0].start, words[-1].end)
                 if sig in processed_sigs:
                     logger.warning(f"Skipping duplicate segment: {sig}")
                     continue

                 processed_sigs.add(sig)

                 sentences.append(Sentence(
                     text=res_seg.text.strip(),
                     start=words[0].start, # Precise word-based start
                     end=words[-1].end,
                     words=words
                 ))
        return sentences

    def _split_cjk_words(self, sentence: Sentence):
        """Pillar 3: Split CJK words into characters."""
        import re
        new_words = []
        cjk_pattern = re.compile(r'[\u4e00-\u9fff]')
        
        for w in sentence.words:
            # Check if CJK and length > 1
            if len(w.word) > 1 and cjk_pattern.search(w.word):
                # Split
                chars = list(w.word)
                duration = w.end - w.start
                char_duration = duration / len(chars)
                
                for i, char in enumerate(chars):
                    c_start = w.start + (i * char_duration)
                    c_end = w.start + ((i+1) * char_duration)
                    new_words.append(Word(
                        word=char,
                        start=round(c_start, 3),
                        end=round(c_end, 3),
                        confidence=w.confidence
                    ))
            else:
                new_words.append(w)
        
        sentence.words = new_words

    def _apply_silence_splitting(self, sentence: Sentence) -> List[Sentence]:
        """Pillar 4: Split sentence if gap > 1.0s."""
        if not sentence.words:
            return [sentence]
            
        sub_sentences = []
        current_words = [sentence.words[0]]
        
        for i in range(1, len(sentence.words)):
            prev_w = sentence.words[i-1]
            curr_w = sentence.words[i]
            gap = curr_w.start - prev_w.end
            
            if gap > 1.0:
                # Split here
                if current_words:
                    sub_sentences.append(self._create_sentence_from_words(current_words))
                current_words = [curr_w]
            else:
                current_words.append(curr_w)
                
        if current_words:
            sub_sentences.append(self._create_sentence_from_words(current_words))
            
        return sub_sentences

    def _create_sentence_from_words(self, words: List[Word]) -> Sentence:
        text = "".join([w.word for w in words]) # Simple join for CJK, space?
        # Ideally handle spaces for non-CJK. But prompt focused on CJK.
        # For mixed, might need smarter join.
        # Whisper words usually come with leading spaces if En?
        return Sentence(
            text=text,
            start=words[0].start,
            end=words[-1].end,
            words=words
        )

    def _add_phonemes(self, sentences: List[Sentence], language: str):
        """Pillar 5: Add Pinyin (CN) or IPA (EN)."""
        if language not in ["zh", "en"]:
            return

        for sent in sentences:
            for w in sent.words:
                text = w.word.strip()
                if not text: continue
                
                try:
                    if language == "zh":
                        # Only apply to CJK characters
                        if re.search(r'[\u4e00-\u9fff]', text):
                            # Use TONE style (e.g., nǐ hǎo)
                            pys = pypinyin.pinyin(text, style=pypinyin.Style.TONE, heteronym=False)
                            # Flatten: [['ni'], ['hao']] -> "nihao" (but usually it's per character in our new logic)
                            w.phoneme = "".join([x[0] for x in pys])
                            
                    elif language == "en":
                        # Convert to IPA
                        # Note: eng_to_ipa.convert returns output with '*' if unknown
                        ipa = eng_to_ipa.convert(text)
                        if ipa and "*" not in ipa:
                            w.phoneme = ipa
                except Exception as e:
                    logger.warning(f"Phonetic error for '{text}': {e}")

