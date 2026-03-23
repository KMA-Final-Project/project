import logging
from pathlib import Path
from threading import Lock
from typing import Literal, List

import librosa
import numpy as np
import soundfile as sf
import tempfile

from loguru import logger
from src.config import settings

# Suppress HF warnings globally
from transformers import logging as hf_logging

hf_logging.set_verbosity_error()

# Suppress PyTorch/NumPy writeable warning (benign for inference)
import warnings

warnings.filterwarnings("ignore", message=".*The given NumPy array is not writable.*")

# ─── Constants ────────────────────────────────────────────────────────────────

SAMPLE_DURATION_SEC = 30  # Each sample is 30 seconds
SAMPLE_POSITIONS = [0.10, 0.50, 0.90]  # Sample at 10%, 50%, 90% of audio
SAMPLE_WEIGHTS = [1.0, 2.0, 2.0]  # Middle/end weighted higher (intros often have music)

MUSIC_KEYWORDS = [
    "music",
    "singing",
    "instrument",
    "piano",
    "guitar",
    "violin",
    "drum",
    "zither",
    "flute",
    "orchestra",
    "band",
    "pop",
    "rock",
    "jazz",
    "electronic",
    "synthesizer",
    "harp",
    "pizzicato",
    "new-age",
]

SPEECH_KEYWORDS = ["speech", "narration", "conversation", "interview", "monologue"]


class AudioInspector:
    """
    Analyzes audio features to determine if it is Music or Standard Speech.

    Uses multi-segment sampling: classifies 3 segments at different positions
    in the audio and takes a weighted vote, preventing short music intros/outros
    from dominating the classification of long speech content.
    """

    _shared_classifier = None
    _classifier_lock: Lock = Lock()

    def __init__(self):
        pass

    def _get_classifier(self):
        """Lazy-load the AST classifier once per process."""
        if type(self)._shared_classifier is None:
            with type(self)._classifier_lock:
                if type(self)._shared_classifier is None:
                    from transformers import pipeline

                    device = 0 if settings.DEVICE == "cuda" else -1
                    logger.info(
                        "Loading AST audio classifier: MIT/ast-finetuned-audioset-10-10-0.4593"
                    )
                    type(self)._shared_classifier = pipeline(
                        "audio-classification",
                        model="MIT/ast-finetuned-audioset-10-10-0.4593",
                        device=device,
                    )
                    logger.success("AST audio classifier loaded successfully.")
        return type(self)._shared_classifier

    @classmethod
    def prewarm(cls) -> None:
        """Eagerly load the shared AST classifier for this process."""
        cls()._get_classifier()

    def inspect(self, file_path: Path | str) -> Literal["music", "standard"]:
        """
        Analyze audio profile using multi-segment AST classification.

        Strategy:
        1. Load audio and get total duration
        2. For short audio (<45s): classify the whole file (original behavior)
        3. For longer audio: sample 3 segments at 10%, 50%, 90% of duration
        4. Weighted vote: middle/end segments count 2x (intros often have music)
        5. Early exit: if ANY segment strongly detects speech, return "standard"
        """
        path = Path(file_path)
        if not path.exists():
            return "standard"

        logger.info(f"Inspecting profile with AST (multi-segment): {path.name}")

        try:
            classifier = self._get_classifier()

            # Get audio duration without loading full audio
            duration = librosa.get_duration(path=str(path))
            logger.debug(f"Audio duration: {duration:.1f}s")

            # Short audio: classify whole file directly (original behavior)
            if duration < 45:
                scores = self._classify_segment(classifier, str(path))
                return self._decide(scores["music"], scores["speech"], "single-segment")

            # Long audio: multi-segment sampling
            audio, sr = librosa.load(str(path), sr=16000)

            weighted_music = 0.0
            weighted_speech = 0.0
            total_weight = 0.0

            for i, (position, weight) in enumerate(
                zip(SAMPLE_POSITIONS, SAMPLE_WEIGHTS)
            ):
                start_sec = max(0, duration * position - SAMPLE_DURATION_SEC / 2)
                end_sec = min(duration, start_sec + SAMPLE_DURATION_SEC)
                start_sec = max(0, end_sec - SAMPLE_DURATION_SEC)  # Adjust if near end

                start_sample = int(start_sec * sr)
                end_sample = int(end_sec * sr)
                segment = audio[start_sample:end_sample]

                if len(segment) < sr:  # Skip segments shorter than 1 second
                    continue

                # Write segment to temp file for classifier
                with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                    tmp_path = tmp.name
                    sf.write(tmp_path, segment, sr)

                try:
                    scores = self._classify_segment(classifier, tmp_path)
                    logger.debug(
                        f"  Segment {i+1} ({start_sec:.0f}s-{end_sec:.0f}s): "
                        f"music={scores['music']:.2f} speech={scores['speech']:.2f}"
                    )

                    # Early exit: strong speech in ANY non-intro segment → standard
                    if i > 0 and scores["speech"] > 0.3:
                        logger.success(
                            f"Inspector Decision: [STANDARD] (Strong speech in segment {i+1}) -- "
                            f"Speech: {scores['speech']:.2f}"
                        )
                        return "standard"

                    weighted_music += scores["music"] * weight
                    weighted_speech += scores["speech"] * weight
                    total_weight += weight
                finally:
                    Path(tmp_path).unlink(missing_ok=True)

            # Normalize
            if total_weight > 0:
                weighted_music /= total_weight
                weighted_speech /= total_weight

            return self._decide(weighted_music, weighted_speech, "multi-segment")

        except Exception as e:
            logger.error(f"AST Inspection failed: {e}. Defaulting to 'standard'.")
            return "standard"

    def _classify_segment(self, classifier, audio_path: str) -> dict:
        """Classify a single audio segment and return music/speech scores."""
        outputs = classifier(audio_path, top_k=5)

        music_score = 0.0
        speech_score = 0.0

        for pred in outputs:
            label_lower = pred["label"].lower()
            score = pred["score"]

            if any(k in label_lower for k in MUSIC_KEYWORDS):
                music_score += score
            if any(k in label_lower for k in SPEECH_KEYWORDS):
                speech_score += score

        return {"music": music_score, "speech": speech_score, "raw": outputs}

    def _decide(
        self, music_score: float, speech_score: float, method: str
    ) -> Literal["music", "standard"]:
        """Make final decision based on aggregated scores."""
        log_msg = f"Music: {music_score:.2f} | Speech: {speech_score:.2f}"

        if music_score > 0.4 and music_score > speech_score * 2:
            profile = "music"
            reason = "Music Dominated"
        elif speech_score > 0.2:
            profile = "standard"
            reason = "Speech Detected"
        elif music_score > 0.3:
            profile = "music"
            reason = "Moderate Music (no speech)"
        else:
            profile = "standard"
            reason = "Ambiguous (Default Standard)"

        logger.success(
            f"Inspector Decision: [{profile.upper()}] ({reason}) [{method}] -- {log_msg}"
        )
        return profile
