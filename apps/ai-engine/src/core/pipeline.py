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
from src.core.semantic_merger import SemanticMerger

class PipelineOrchestrator:
    """
    Main Orchestrator for the Bilingual Subtitle Pipeline.
    Coordinates: Audio -> VAD (Isolation) -> Alignment -> Semantic Merge -> Translation -> Subtitle.
    """
    
    def __init__(self):
        self.audio_processor = AudioProcessor()
        self.audio_inspector = AudioInspector()
        self.vad_manager = VADManager()
        self.aligner = SmartAligner()
        self.translator = TranslatorEngine()
        self.merger = SemanticMerger()
        
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
        self._save_debug_step(input_path, "1_inspection", {"profile": profile, "path": str(standardized_path)})
        
        # 3. VAD & Isolation
        # Returns segments AND the path to use for alignment (which might be isolated vocals)
        logger.info(f">>> Step 3: VAD & Isolation ({profile} mode)")
        segments, clean_audio_path = self.vad_manager.process(standardized_path, profile=profile)
        self._save_debug_step(input_path, "2_vad_segments", [s.model_dump() for s in segments])
        
        if not segments:
            logger.warning("No speech detected. Exiting.")
            return self._save_empty_result(input_path)
            
        # 4. Alignment (Transcription)
        # Verify we are using the CLEAN path
        logger.info(f">>> Step 4: Smart Alignment (Input: {clean_audio_path.name})")
        sentences = self.aligner.process(clean_audio_path, segments, profile=profile)
        self._save_debug_step(input_path, "3_aligned", [s.model_dump() for s in sentences])
        
        # 5. Semantic Merging & Correction (Advanced Optimization)
        # SAFE Version: Groups lines + Fixes Homophones. Strictly preserves original timestamps/chars.
        logger.info(f">>> Step 5: Semantic Merging & Correction ({len(sentences)} segments)")
        
        if profile == "music" or len(sentences) > 5:
             try:
                 sentences = self.merger.process(sentences, context_style="Modern/Classical Song")
             except Exception as e:
                 logger.error(f"Semantic Merge failed: {e}")
        
        self._save_debug_step(input_path, "4_merged", [s.model_dump() for s in sentences])

        
        # 6. Translation (Translate the Merged Lines)
        # Note: Since Merger fixed homophones, the input to Translator is cleaner.
        # But Translator still runs its own "Correction" pass? 
        # Actually, if Merger did its job (Task 2: Correct Homophones), Translator's correction might be redundant.
        # However, Translator's correction is "Character Level" refinement.
        # Let's keep it but maybe simplify prompts? No, keep robust.
        
        logger.info(f">>> Step 6: Translation (Target: {target_lang})")
        
        # Convert Sentences (Pydantic) to Dicts for Engine
        segments_data = [s.model_dump() for s in sentences]
        
        try:
            # We use the standard 2-Pass flow (Analyze -> Correct -> Translate).
            # Even if Merger fixed things, Analysis helps style.
            translations = self.translator.process_two_pass(segments_data, target_lang=target_lang)
            
            # Merge back translations
            for i, sent in enumerate(sentences):
                # We update the original Sentences (wait, list of dicts or objects?)
                # We need to return Sentence objects ideally, or just save the dicts.
                # Let's update the dict list for saving.
                if i < len(translations):
                    segments_data[i]['translation'] = translations[i]
                else:
                    segments_data[i]['translation'] = ""
                    
        except Exception as e:
            logger.error(f"Translation failed: {e}")
            for d in segments_data:
                d['translation'] = "[Error]"

        # 7. Export
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

    def _save_debug_step(self, input_path: Path, step_name: str, data: any):
        """Helper to save intermediate JSON artifacts for debugging."""
        debug_dir = settings.BASE_DIR / "outputs" / "debug" / input_path.stem
        debug_dir.mkdir(parents=True, exist_ok=True)
        
        output_path = debug_dir / f"{step_name}.json"
        try:
            with open(output_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            logger.debug(f"Saved debug artifact: {step_name}")
        except Exception as e:
            logger.warning(f"Failed to save debug artifact {step_name}: {e}")
