"""
VAD Manager Module
==================
Handles Voice Activity Detection (VAD) using Silero VAD.
Splits audio into segments based on speech timestamps and a greedy merge strategy.
"""

from __future__ import annotations

from pathlib import Path
from typing import List, Union

from loguru import logger
import torch
import numpy as np
import librosa
from silero_vad import load_silero_vad, get_speech_timestamps

from src.config import settings
from src.schemas import SegmentType, VADSegment
from src.utils.audio_processor import AudioMetadata


class VADManager:
    """
    VAD Manager (Singleton).
    detected speech segments are processed to ensure they fall within
    optimal duration ranges for Whisper (Happy Case vs Special Case).
    """
    
    _instance = None
    _model = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(VADManager, cls).__new__(cls)
        return cls._instance
    
    def __init__(self):
        """Initialize the VAD Manager and load the Silero VAD model."""
        if self._model is None:
            msg = f"Loading Silero VAD model (Device: {settings.DEVICE}, Threshold: {settings.VAD_THRESHOLD})"
            logger.info(msg)
            # Load ONNX model for speed
            # Use onnx=True for ONNX Runtime (CPU/GPU)
            self._model = load_silero_vad(onnx=True)
            logger.info("Silero VAD model loaded successfully.")

    def process(
        self, 
        file_path: Union[str, Path], 
        profile: str = "standard"
    ) -> List[VADSegment]:
        """
        Process audio file to detect speech segments.
        
        Args:
            file_path: Path to the 16kHz WAV file.
            profile: "standard" (default) or "music".
                     Music mode uses adaptive thresholds and bandpass proxy.
            
        Returns:
            List[VADSegment]: List of detected speech segments.
        """
        path = Path(file_path) if isinstance(file_path, str) else file_path
        
        if not path.exists():
            raise FileNotFoundError(f"Audio file not found: {path}")
            
        logger.info(f"Starting VAD processing ({profile} mode) for: {path.name}")
        
        # --- Mode Selection ---
        vad_input_path = path
        
        # Default Parameters (Standard Mode)
        threshold = 0.6
        min_silence_ms = 200
        speech_pad_ms = 100
        
        if profile == "music":
            # MUSIC MODE (Vocal Isolation Enabled)
            logger.info("🎶 Music Mode active: Using BS-Roformer Vocal Isolation")
            
            # Use new VocalIsolator module
            try:
                from src.utils.vocal_isolator import VocalIsolator
                isolator = VocalIsolator()
                vad_input_path = isolator.extract_vocals(path)
                
                # Balanced Parameters for Isolated Vocals
                # 0.4 is safe because BS-Roformer is very clean
                threshold = 0.4             
                min_silence_ms = 400        
                speech_pad_ms = 200         
            except Exception as e:
                logger.error(f"Failed to isolate vocals: {e}. Fallback to standard mode.")
                # Fallback to standard processing
                profile = "standard"
                vad_input_path = path

        if profile == "standard":
             # Ensure defaults are set if we fell back
             threshold = 0.6
             min_silence_ms = 200
             speech_pad_ms = 100
        
        # 1. Read Audio (Proxy or Original)
        # wav = read_audio(str(vad_input_path), sampling_rate=16000)
        logger.info(f"Loading audio via Librosa: {file_path}")
        
        wav_np, sr = librosa.load(str(vad_input_path), sr=16000)
        
        wav = torch.from_numpy(wav_np)
        
        if len(wav.shape) == 1:
            wav = wav.unsqueeze(0)
        
        # 2. Get Raw Timestamps
        raw_speech_timestamps = get_speech_timestamps(
            wav,
            self._model,
            threshold=threshold,
            min_speech_duration_ms=250,
            min_silence_duration_ms=min_silence_ms,
            speech_pad_ms=speech_pad_ms,
            return_seconds=True,
        )
        
        # Cleanup proxy if used
        # if profile == "music" and vad_input_path != path:
        #     try:
        #         vad_input_path.unlink()
        #         logger.debug(f"Removed temporary VAD proxy: {vad_input_path}")
        #     except Exception as e:
        #         logger.warning(f"Failed to cleanup proxy: {e}")
        
        if not raw_speech_timestamps:
            logger.warning(f"No speech detected in {path.name}")
            return []
            
        logger.debug(f"Raw detected segments: {len(raw_speech_timestamps)}")
        
        # 3. Greedy Merge Strategy
        segments = self._greedy_merge(raw_speech_timestamps)
        
        # 4. Statistics logging
        happy_count = sum(1 for s in segments if s.type == SegmentType.HAPPY_CASE)
        special_count = sum(1 for s in segments if s.type == SegmentType.SPECIAL_CASE)
        
        logger.info(
            f"VAD Complete. Total: {len(segments)} | "
            f"Happy: {happy_count} | Special: {special_count}"
        )
        
        return segments

    def _greedy_merge(self, raw_timestamps: List[dict]) -> List[VADSegment]:
        """
        Merge raw timestamps into optimal segments using Greedy Strategy.
        
        Logic:
        - Target duration: 5s - 15s
        - Greedy Cut: If duration > 5s AND gap > 0.5s -> Split
        - Hard Limit: If duration >= 20s -> Force Split (Special Case)
        """
        merged_segments = []
        
        if not raw_timestamps:
            return []
            
        # Current accumulated segment state
        current_start = raw_timestamps[0]['start']
        current_end = raw_timestamps[0]['end']
        
        for i in range(1, len(raw_timestamps)):
            ts = raw_timestamps[i]
            next_start = ts['start']
            next_end = ts['end']
            
            gap = next_start - current_end
            current_duration = current_end - current_start
            
            # --- Decision Logic ---
            
            should_limit_split = False
            
            # Check if merging would exceed the hard limit (20s)
            potential_duration = next_end - current_start
            if potential_duration >= 20.0:
                should_limit_split = True
                
            # Greedy Cut: Valid duration > 5s and meaningful gap > 0.5s
            should_greedy_split = (current_duration > 5.0 and gap > 0.5)
            
            if should_limit_split or should_greedy_split:
                # Finalize current segment
                self._add_segment(merged_segments, current_start, current_end)
                
                # Start new segment
                current_start = next_start
                current_end = next_end
            else:
                # Merge
                current_end = next_end
                
        # Finalize the last segment
        self._add_segment(merged_segments, current_start, current_end)
        
        return merged_segments

    def _add_segment(self, segments_list: List[VADSegment], start: float, end: float):
        """Helper to create and categorize VADSegment."""
        duration = end - start
        
        # Classification
        # Happy Case: <= 15s
        # Special Case: > 15s (requires further splitting/alignment)
        if duration <= 15.0:
            seg_type = SegmentType.HAPPY_CASE
        else:
            seg_type = SegmentType.SPECIAL_CASE
            
        segment = VADSegment(
            start=round(start, 3),
            end=round(end, 3),
            duration=round(duration, 3),
            type=seg_type
        )
        segments_list.append(segment)
