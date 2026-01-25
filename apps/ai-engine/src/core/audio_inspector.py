"""
Audio Inspector Module
======================
Analyzer (Gatekeeper) that classifies audio content as 'music' or 'standard'.
Used to optimize pipeline routing (deciding whether to run Vocal Isolation).
"""

from __future__ import annotations

import librosa
import numpy as np
from pathlib import Path
from loguru import logger
from typing import Literal

from src.utils.audio_processor import AudioProcessor


class AudioInspector:
    """
    Analyzes audio features to determine if it is Music or Standard Speech.
    """
    
    def inspect(self, file_path: Path | str) -> Literal["music", "standard"]:
        """
        Analyze the full audio file to determine profile.
        
        Logic:
        - Music: High rhythmic regularity (onset variance) + High spectral energy/flatness.
        - Standard: Irregular rhythm, vocal-centric spectrum.
        
        Returns:
            "music" if features suggest music/singing.
            "standard" otherwise.
        """
        path = Path(file_path)
        if not path.exists():
            logger.error(f"Inspector: File not found {path}")
            return "standard" # Default safe

        logger.info(f"Inspecting audio profile for: {path.name}")
        
        try:
            # Load full audio (16kHz mono)
            # Duration check: Librosa load is fast.
            # Assuming chunks < 5 mins as per requirements.
            y, sr = librosa.load(str(path), sr=16000)
            
            if len(y) < sr * 1.0: # Too short (<1s)
                 logger.warning("Audio too short for inspection. Defaulting to 'standard'.")
                 return "standard"

            # --- Heuristic 1: Rhythm / Beat Strength ---
            # Music has steady beats. Speech is irregular.
            onset_env = librosa.onset.onset_strength(y=y, sr=sr)
            
            # Pulse clarity (beat variance)
            # Higher std dev of onset envelope typically implies spikes (beats).
            # But we want 'regularity'. 
            # 'tempogram' is better but heavy.
            # Simple Proxy: Mean onset strength (Energy of attacks)
            onset_mean = np.mean(onset_env)
            
            # --- Heuristic 2: Spectral Features ---
            # Music fills spectrum (drums + hats). Speech is band-limited.
            # Spectral Flatness: How "noise-like" vs "tonal". 
            # Music (High hats/Cymbals) -> High flatness components. 
            # Speech -> Tonal (Harmonic) but low flatness.
            # Spectral Centroid: 'Brightness'. Music often brighter.
            
            spectral_centroid = librosa.feature.spectral_centroid(y=y, sr=sr)
            centroid_mean = np.mean(spectral_centroid)
            
            # --- Decision Logic (Empirical Thresholds) ---
            # Thresholds need tuning.
            # Onset Mean > 1.2 usually implies strong hits (Drums).
            # Centroid Mean > 2000Hz implies brightness (Music/High fidelity).
            
            # Score-based approach
            score = 0
            
            if onset_mean > 1.2: score += 1
            if centroid_mean > 1800: score += 1
            
            # Bias: We prefer "music" false positive over false negative.
            # If ANY sign of music, classify music.
            is_music = (score >= 1)
            
            # Detailed Logging for Tuning
            logger.debug(f"Inspector Stats | Onset: {onset_mean:.3f} | Centroid: {centroid_mean:.0f} | Score: {score}")
            
            profile = "music" if is_music else "standard"
            logger.info(f"Inspector detected profile: [{profile.upper()}] (Onset={onset_mean:.2f}, Cent={centroid_mean:.0f})")
            
            return profile

        except Exception as e:
            logger.error(f"Inspection failed: {e}. Defaulting to 'music' (Safe Mode).")
            return "music" # Safe fallback (Isolate just in case)
