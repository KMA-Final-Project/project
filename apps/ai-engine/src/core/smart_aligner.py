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
from typing import List, Optional

from loguru import logger
from faster_whisper import WhisperModel

from src.config import settings
from src.schemas import VADSegment, Sentence, Word


class SmartAligner:
    """
    Singleton class for transcription and alignment.
    """
    _instance = None
    _model: WhisperModel | None = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(SmartAligner, cls).__new__(cls)
        return cls._instance

    def __init__(self):
        if self._model is None:
            # --- Model Selection ---
            # [Option 1] large-v3: Best Accuracy, Multi-lingual (Default)
            model_size = "large-v3"
            
            # [Option 2] large-v3-turbo: Faster, Optimized for Vi/Long Audio
            # model_size = "deepdml/faster-whisper-large-v3-turbo-ct2"

            logger.info(f"Loading Faster-Whisper Model: {model_size} (Device: {settings.DEVICE})")
            
            # Compute type: float16 for GPU, int8/float32 for CPU
            compute_type = "float16" if settings.DEVICE == "cuda" else "int8"
            
            self._model = WhisperModel(
                model_size,
                device=settings.DEVICE,
                compute_type=compute_type
            )
            logger.success(f"Faster-Whisper Model ({model_size}) loaded successfully.")

    def process(self, file_path: Path | str, segments: List[VADSegment], profile: str = "standard") -> List[Sentence]:
        """
        Transcribe audio with Dynamic Anchor Strategy and Advanced Prompting.
        """
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"Audio file not found: {path}")

        logger.info(f"Starting Smart Alignment for: {path.name} ({len(segments)} segments) | Profile: {profile}")

        # Loading audio (16kHz mono)
        audio_full, sr = librosa.load(str(path), sr=16000)
        
        sentences: List[Sentence] = []
        previous_text_context = "" 
        
        # Pillar 1: Anchor Language State
        anchor_language: str | None = None
        
        for i, seg in enumerate(segments):
            start_sample = int(seg.start * 16000)
            end_sample = int(seg.end * 16000)
            
            if start_sample >= len(audio_full): break
            audio_segment = audio_full[start_sample:end_sample]
            if len(audio_segment) < 160: continue
                
            # --- Pillar 2: Dynamic Prompt Injection ---
            prompt = self._construct_prompt(profile, previous_text_context)
            
            # --- Pillar 1: Language Strategy ---
            # Determine language for this segment
            # If Anchor is set, use it. Else Auto-detect.
            current_lang = anchor_language # None if not set
            
            transcription_result = self._transcribe_segment(
                audio_segment, prompt, language=current_lang
            )
            
            # Logic: Anchor Detection & Fallback
            if anchor_language is None:
                # Attempt to set Anchor
                # Criteria: High Confidence (> -0.5)
                # Note: Whisper 'avg_logprob' is negative. Closer to 0 is better.
                best_segment = transcription_result["best_segment"]
                if best_segment and best_segment.avg_logprob > -0.5:
                    anchor_language = transcription_result["info"].language
                    logger.success(f"⚓ Anchor Language Set: {anchor_language} (Conf: {best_segment.avg_logprob:.2f})")
            else:
                # We used Anchor. Check if Fallback needed.
                # Criteria: Low Confidence (< -0.8) OR High Compression (> 2.4)
                best_segment = transcription_result["best_segment"]
                if best_segment and (best_segment.avg_logprob < -0.8 or best_segment.compression_ratio > 2.4):
                    logger.warning(f"⚠️ Low confidence with Anchor ({best_segment.avg_logprob:.2f}). Retrying with Auto-Detect...")
                    
                    # Retry with Auto-Detect
                    fallback_result = self._transcribe_segment(
                         audio_segment, prompt, language=None
                    )
                    
                    # Compare? Usually just trust the Auto result if it's better?
                    # Honest Fallback: Usage of Auto result is safer here.
                    transcription_result = fallback_result
            
            # Extract Results
            res_sentences = self._process_transcription_result(transcription_result, seg)
            
            # --- Pillar 3 & 4: Post-Processing ---
            for sent in res_sentences:
                # CJK Splitting
                self._split_cjk_words(sent)
                
                # Silence Splitting (Returns list of sentences)
                split_sents = self._apply_silence_splitting(sent)
                sentences.extend(split_sents)
                
                # Update Context (Use the last text)
                if split_sents:
                    previous_text_context += " " + split_sents[-1].text

        logger.success(f"Alignment Complete. Generated {len(sentences)} sentences.")
        return sentences

    def _transcribe_segment(self, audio, prompt, language):
        """Helper to run transcription and return generator + info."""
        gen, info = self._model.transcribe(
            audio,
            beam_size=5,
            word_timestamps=True,
            condition_on_previous_text=False,
            initial_prompt=prompt,
            language=language
        )
        segments = list(gen)
        # Find best segment for confidence stats (usually the longest or first?)
        # Whisper might return multiple segments for one audio chunk?
        # We take the one with best logprob or average?
        # Usually for short VAD segments, there is 1 Whisper segment.
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
