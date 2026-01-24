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

    def process(self, file_path: Path | str, segments: List[VADSegment]) -> List[Sentence]:
        """
        Transcribe the audio segments with context injection.
        """
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"Audio file not found: {path}")

        logger.info(f"Starting Smart Alignment for: {path.name} ({len(segments)} segments)")

        # 1. Load Audio Output (Full) into Memory
        # We load as 16kHz mono because Whisper expects this.
        # Librosa is robust.
        start_load = torch.cuda.Event(enable_timing=True)
        end_load = torch.cuda.Event(enable_timing=True)
        
        # Simple timing usage if on CUDA, otherwise just ignore
        # Loading audio
        audio_full, sr = librosa.load(str(path), sr=16000)
        
        sentences: List[Sentence] = []
        previous_text_context = "" # Context window (last 200 chars)

        for i, seg in enumerate(segments):
            # Calculate sample indices
            start_sample = int(seg.start * 16000)
            end_sample = int(seg.end * 16000)
            
            # Safe slicing
            if start_sample >= len(audio_full):
                break
            
            # Extract segment audio
            # Padding is handled by VAD usually, but we take strict VAD boundaries here.
            audio_segment = audio_full[start_sample:end_sample]
            
            # Skip empty
            if len(audio_segment) < 160: # < 0.01s
                continue
                
            # Prepare Prompt (Context Injection)
            prompt = previous_text_context[-200:] if previous_text_context else None
            
            # --- Transcription ---
            try:
                # word_timestamps=True is crucial for Karaoke
                # condition_on_previous_text=False because we manually inject prompt
                # language=None (Auto-Detect)
                
                gen, info = self._model.transcribe(
                    audio_segment,
                    beam_size=5,
                    word_timestamps=True,
                    condition_on_previous_text=False,
                    initial_prompt=prompt,
                    language=None # Auto-detect per segment
                )
                
                # Consume generator
                segment_results = list(gen)
                
                # Log detection info
                if info.language_probability > 0.5:
                     logger.debug(f"Detected: {info.language} ({info.language_probability:.0%})")
                
                # --- Anti-Hallucination ---
                # Check metrics from 'segment_results' (which are segments)
                
                valid_words_bucket = []
                full_text_bucket = []
                
                for res_seg in segment_results:
                    # Guardrails
                    if res_seg.avg_logprob < -1.0:
                        logger.warning(f"Discarding segment (Low Confidence {res_seg.avg_logprob:.2f}): {res_seg.text}")
                        continue
                        
                    if res_seg.compression_ratio > 2.4:
                        logger.warning(f"Discarding segment (High Compression {res_seg.compression_ratio:.2f}): {res_seg.text}")
                        continue
                        
                    if res_seg.no_speech_prob > 0.6:
                         # 0.6 is a safe threshold
                        logger.warning(f"Discarding segment (No Speech {res_seg.no_speech_prob:.2f}): {res_seg.text}")
                        continue
                    
                    full_text_bucket.append(res_seg.text)
                    
                    # Process Words
                    if res_seg.words:
                        for w in res_seg.words:
                            # Shift timestamps relative to original audio
                            abs_start = seg.start + w.start
                            abs_end = seg.start + w.end
                            
                            valid_words_bucket.append(Word(
                                word=w.word,
                                start=round(abs_start, 3),
                                end=round(abs_end, 3),
                                confidence=round(w.probability, 3)
                            ))
                
                # Construct Sentence for this VAD Segment
                joined_text = "".join(full_text_bucket).strip()
                
                if joined_text:
                    # Update context for next iteration
                    previous_text_context += " " + joined_text
                    
                    sentence = Sentence(
                        text=joined_text,
                        start=seg.start,
                        end=seg.end,
                        words=valid_words_bucket
                    )
                    sentences.append(sentence)
                    
                    msg = f"Segment {i+1}/{len(segments)}: {joined_text[:30]}... ({len(valid_words_bucket)} words)"
                    logger.debug(msg)
                else:
                    logger.debug(f"Segment {i+1}: Silence/Filtered")

            except Exception as e:
                logger.error(f"Transcription failed for segment {i}: {e}")
                
        logger.success(f"Alignment Complete. Generated {len(sentences)} sentences.")
        return sentences
