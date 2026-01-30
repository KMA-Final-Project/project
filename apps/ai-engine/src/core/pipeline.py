from __future__ import annotations

import json
from pathlib import Path
from typing import List, Optional

from loguru import logger

from src.config import settings
from src.schemas import Sentence
from src.utils.audio_processor import AudioProcessor
from src.core.audio_inspector import AudioInspector
from src.core.vad_manager import VADManager
from src.core.smart_aligner import SmartAligner
from src.core.translator_engine import TranslatorEngine

class PipelineOrchestrator:
    """
    Main Orchestrator for the Bilingual Subtitle Pipeline.
    Coordinates: Audio -> VAD (Isolation) -> Alignment -> Translation -> Subtitle.
    """
    
    def __init__(self):
        self.audio_processor = AudioProcessor()
        self.audio_inspector = AudioInspector()
        self.vad_manager = VADManager()
        self.aligner = SmartAligner()
        self.translator = TranslatorEngine()
        
    def process_video(self, input_path: Path | str, target_lang: str = "vi") -> Path:
        """
        Full End-to-End Pipeline.
        Returns path to the final JSON output containing aligned & translated subtitles.
        """
        input_path = Path(input_path)
        if not input_path.exists():
            raise FileNotFoundError(f"Input file not found: {input_path}")
            
        logger.info(f"🚀 Starting Pipeline for: {input_path.name}")
        
        # 1. Standardize Audio (16kHz WAV)
        logger.info(">>> Step 1: Audio Standardization")
        meta = self.audio_processor.process(input_path)
        standardized_path = meta.path
        
        # 2. Inspect Audio (Detect Profile: Music vs Standard)
        logger.info(">>> Step 2: Audio Inspection")
        profile = self.audio_inspector.inspect(standardized_path)
        
        # 3. VAD & Isolation
        # Returns segments AND the path to use for alignment (which might be isolated vocals)
        logger.info(f">>> Step 3: VAD & Isolation ({profile} mode)")
        segments, clean_audio_path = self.vad_manager.process(standardized_path, profile=profile)
        
        if not segments:
            logger.warning("No speech detected. Exiting.")
            return self._save_empty_result(input_path)
            
        # 4. Alignment (Transcription)
        # Verify we are using the CLEAN path
        logger.info(f">>> Step 4: Smart Alignment (Input: {clean_audio_path.name})")
        sentences = self.aligner.process(clean_audio_path, segments, profile=profile)
        
        # 5. Translation (Two-Pass: Correct -> Translate)
        logger.info(f">>> Step 5: Translation (Target: {target_lang})")
        
        # Convert Sentences (Pydantic) to Dicts for Engine
        # We need to preserve the structure. engine.process_two_pass expects List[dict]
        # and returns List[str]. We then merge back.
        
        # Strategy:
        # a. Extract 'text'
        segments_data = [s.model_dump() for s in sentences]
        
        # b. Run Two-Pass Workflow
        # This handles: Analysis -> Correction (using Pinyin logic implicitly if we add it) -> Translation
        try:
            translations = self.translator.process_two_pass(segments_data, target_lang=target_lang)
            
            # c. Merge back
            if len(translations) != len(sentences):
                logger.warning(f"Translation count mismatch! Src: {len(sentences)}, Trn: {len(translations)}")
                # Fallback: Zip longest or pad?
                # Engine guarantees list length match usually.
                
            for i, sent in enumerate(sentences):
                if i < len(translations):
                    # We store translation in a new field?
                    # Schema Sentence doesn't have 'translation'. 
                    # We should probably update Schema or just return Dict.
                    # For now, let's attach it dynamically or use a new dict.
                    segments_data[i]['translation'] = translations[i]
                else:
                    segments_data[i]['translation'] = ""
                    
        except Exception as e:
            logger.error(f"Translation failed: {e}")
            # Continue without translation
            for d in segments_data:
                d['translation'] = "[Error]"

        # 6. Export
        output_path = self._save_result(input_path, segments_data)
        logger.success(f"🎉 Pipeline Complete! Result: {output_path}")
        
        return output_path

    def _save_result(self, input_path: Path, data: List[dict]) -> Path:
        output_dir = settings.BASE_DIR / "outputs"
        output_dir.mkdir(exist_ok=True)
        
        filename = f"{input_path.stem}_final.json"
        output_path = output_dir / filename
        
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            
        return output_path

    def _save_empty_result(self, input_path: Path) -> Path:
        return self._save_result(input_path, [])
