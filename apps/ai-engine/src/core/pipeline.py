from __future__ import annotations

from loguru import logger

from src.utils.audio_processor import AudioProcessor
from src.core.audio_inspector import AudioInspector
from src.core.vad_manager import VADManager
from src.core.smart_aligner import SmartAligner
from src.core.semantic_merger import SemanticMerger
from src.core.llm_provider import LLMProvider
from src.core.translator_engine import TranslatorEngine

class PipelineOrchestrator:
    """
    Component registry for the Bilingual Subtitle Pipeline.
    Orchestration logic lives in main.py.
    """

    def __init__(self):
        self.audio_processor = AudioProcessor()
        self.audio_inspector = AudioInspector()
        self.vad_manager = VADManager()
        self.aligner = SmartAligner()
        self.merger = SemanticMerger()
        self.llm = LLMProvider()
        self.translator = TranslatorEngine(self.llm)

