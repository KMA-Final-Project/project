"""
Vocal Isolator Module
=====================
Handles vocal isolation using the `audio-separator` library (BS-Roformer / MDX).
Used to preprocess music tracks for better VAD detection.
"""

from __future__ import annotations

import json
import logging
import shutil
from pathlib import Path
from typing import Union

from loguru import logger
from audio_separator.separator import Separator

from src.config import settings


class VocalIsolator:
    """
    Handles separation of vocals from audio using SOTA models (BS-Roformer).
    """

    def __init__(self, output_dir: Path | None = None):
        """
        Initialize VocalIsolator.
        
        Args:
            output_dir: Directory for temporary isolated files.
                        Defaults to settings.TEMP_DIR / "vocals"
        """
        self.output_dir = output_dir or (settings.TEMP_DIR / "vocals")
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # internal configuration
        self.log_level = logging.INFO
        self.model_dir = settings.TEMP_DIR / "models"
        
        # --- Model Selection (User Config) ---
        # Uncomment ONE model below to select the separation engine.
        
        # NOTE: 
        # - .ckpt models (Roformer) run on PyTorch (Heavy, Slow).
        # - .onnx models (MDX-Net) run on ONNX Runtime (Fast, Stable).
        
        # [OPTION 1] BS-Roformer (ViperX 1297)
        # SOTA Quality, but heavy and slow. Best for "Audiophile" results.
        # self.model_filename = "model_bs_roformer_ep_317_sdr_12.9755.ckpt"
        
        # [OPTION 2] Kim_Vocal_2 (MDX-Net) -> ACTIVE
        # Excellent vocal clarity, faster than Roformer. Best Balance.
        self.model_filename = "Kim_Vocal_2.onnx"
        
        # [OPTION 3] UVR-MDX-Net-Inst_HQ_3 (MDX-Net)
        # Very fast, standard VAD choice. Aggressive instrumental removal.
        # self.model_filename = "UVR-MDX-Net-Inst_HQ_3.onnx"
        
        # Cache for Separator instance
        self._separator: Separator | None = None

    def _get_separator(self) -> Separator:
        """Lazy initialization of the Separator engine (heavy load)."""
        if self._separator is None:
            logger.info("Initializing Audio Separator (BS-Roformer)...")
            
            # Initialize with GPU support info if available in settings
            # audio-separator detects CUDA automatically via ONNX Runtime
            self._separator = Separator(
                log_level=logging.INFO,
                model_file_dir=str(settings.TEMP_DIR / "models"),
                output_dir=str(self.output_dir),
                output_single_stem="Vocals", # Only save Vocals
            )
            
            # Load the model explicitly
            logger.info(f"Loading model: {self.model_filename}")
            self._separator.load_model(model_filename=self.model_filename)
            
        return self._separator

    def extract_vocals(self, input_path: Path) -> Path:
        """
        Extracts vocal track from audio using BS-Roformer model via ONNX Runtime.
        
        Args:
            input_path (Path): Path to the original audio file (video or mixed audio).
            
        Returns:
            Path: Path to the isolated vocal file (WAV format).
            Returns the original path if separation fails to avoid pipeline breakage.
        """
        logger.info(f"Starting vocal separation for: {input_path.name}")
        
        try:
            # # 1. Initialize configuration for ONNX Runtime
            # # We explicitly force CUDAExecutionProvider to ensure GPU acceleration is used.
            # # This prevents the library from silently falling back to CPU if CUDA has minor version mismatches.
            # env_specific_config = {
            #     "onnx_execution_providers": ["CUDAExecutionProvider"]
            # }

            # 1. Initialize the Separator
            # output_single_stem="Vocals": Critical optimization. 
            # It tells the model to ONLY save the vocal file and discard the instrumental immediately.
            # This saves 50% disk I/O and storage space in the temp folder.
            separator = Separator(
                log_level=self.log_level,
                model_file_dir=str(self.model_dir),
                output_dir=str(self.output_dir),
                output_format="WAV",
                output_single_stem="Vocals",  
            )

            # 2. Load the SOTA Model
            separator.load_model(model_filename=self.model_filename)

            # 3. Perform Separation
            # The library returns a list of output filenames.
            output_files = separator.separate(str(input_path))

            # 4. Validate Output
            if not output_files:
                logger.error("Vocal separation failed: No output files generated.")
                return input_path

            # Since output_single_stem="Vocals", the list should contain only one file.
            vocal_file = output_files[0]
            vocal_path = self.output_dir / vocal_file

            logger.success(f"Vocals isolated successfully: {vocal_path}")
            return vocal_path

        except Exception as e:
            # Fallback mechanism:
            # If separation crashes (e.g., VRAM OOM, CUDA error), we log the error 
            # but return the ORIGINAL input. This allows the pipeline to continue 
            # (albeit with potential noise) rather than crashing the whole job.
            logger.error(f"Failed to extract vocals: {e}. Falling back to original audio.")
            return input_path