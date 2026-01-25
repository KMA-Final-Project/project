import logging
from pathlib import Path
from typing import Literal

from loguru import logger
from src.config import settings

# Suppress HF warnings globally
from transformers import logging as hf_logging
hf_logging.set_verbosity_error()

# Suppress PyTorch/NumPy writeable warning (benign for inference)
import warnings
warnings.filterwarnings("ignore", message=".*The given NumPy array is not writable.*")

class AudioInspector:
    """
    Analyzes audio features to determine if it is Music or Standard Speech.
    """
    
    def inspect(self, file_path: Path | str) -> Literal["music", "standard"]:
        """
        Analyze audio profile using Hugging Face Transformers (AST Model).
        Model: MIT/ast-finetuned-audioset-10-10-0.4593
        """
        path = Path(file_path)
        if not path.exists():
            return "standard"

        logger.info(f"Inspecting profile with AST (Audio Spectrogram Transformer): {path.name}")
        
        try:
            from transformers import pipeline
            
            # Initialize Pipeline
            # device=0 for CUDA (if available) -> settings.DEVICE logic needed.
            device = 0 if settings.DEVICE == "cuda" else -1
            
            classifier = pipeline(
                "audio-classification", 
                model="MIT/ast-finetuned-audioset-10-10-0.4593",
                device=device
            )
            
            # Predict
            outputs = classifier(str(path), top_k=5)
            
            # Outputs format: [{'score': 0.99, 'label': 'Speech'}, ...]
            logger.info(f"Top 5 Predictions: {outputs}")
            
            # --- Robust Decision Logic ---
            # Sum probabilites for Music vs Speech categories.
            
            music_keywords = [
                "music", "singing", "instrument", "piano", "guitar", "violin", 
                "drum", "zither", "flute", "orchestra", "band", "pop", "rock", 
                "jazz", "electronic", "synthesizer", "harp", "pizzicato", "new-age"
            ]
            
            speech_keywords = ["speech", "narration", "conversation", "interview", "monologue"]
            
            music_score = 0.0
            speech_score = 0.0
            
            for pred in outputs:
                label_lower = pred["label"].lower()
                score = pred["score"]
                
                # Check Music
                if any(k in label_lower for k in music_keywords):
                    music_score += score
                
                # Check Speech
                if any(k in label_lower for k in speech_keywords):
                    speech_score += score
            
            log_msg = f"Inspector Scores | Music: {music_score:.2f} | Speech: {speech_score:.2f}"
            
            # Decision
            # If Music Score is significant (> 0.2) AND higher than Speech Score -> Music
            # (0.2 captures cases where 'Music' is 2nd or 3rd tag)
            if music_score > 0.2 and music_score > speech_score:
                profile = "music"
                decision_reason = "Music Dominated"
            elif speech_score > 0.5:
                profile = "standard"
                decision_reason = "Speech Dominated"
            else:
                # Ambiguous case (e.g. noise). Default to standard unless Strong Music.
                profile = "standard"
                decision_reason = "Ambiguous (Default Standard)"
            
            logger.success(f"Inspector Decision: [{profile.upper()}] ({decision_reason}) -- {log_msg}")
            return profile

        except Exception as e:
            logger.error(f"AST Inspection failed: {e}. Defaulting to 'music'.")
            return "music"
