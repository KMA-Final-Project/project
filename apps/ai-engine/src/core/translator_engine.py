from enum import Enum
from typing import List, Optional, Union
from pydantic import BaseModel, Field
from loguru import logger

class TranslationStyle(str, Enum):
    """
    Defines the tone and style of the translation.
    Used to guide the LLM's output personality.
    """
    # --- GENERAL / SOCIAL ---
    FORMAL = "Formal"  # Business, Academic, Official
    CASUAL = "Casual"  # Daily life, Friends, Vlogs
    NEUTRAL = "Neutral"  # Standard, Objective
    SLANG = "Slang"  # Street language, highly informal

    # --- MEDIA / CONTENT ---
    NEWS = "News"  # Journalistic, Concise, Objective
    DOCUMENTARY = "Documentary"  # Educational, Descriptive
    INTERVIEW = "Interview"  # Dialog-focused, Polite or Casual depending on context
    PODCAST = "Podcast"  # Conversational, engaging
    VLOG = "Vlog"  # Personal, energetic, direct address
    TECH_REVIEW = "Tech Review"  # Technical terms, clear, informative
    GAMING = "Gaming"  # Energetic, gamer slang, reaction-heavy

    # --- MOVIES / FICTION ---
    ACTION = "Action"  # Fast-paced, punchy
    COMEDY = "Comedy"  # Humorous, witty, timing-heavy
    DRAMA = "Drama"  # Emotional, deep, character-driven
    HORROR = "Horror"  # Suspenseful, tense
    SCI_FI = "Sci-Fi"  # Futuristic, technical, imaginative
    ROMANCE = "Romance"  # Soft, emotional, poetic
    HISTORICAL = "Historical"  # Archaic, formal, period-appropriate (Kiem Hiep, Period Dramas)

    # --- MUSIC ---
    MUSIC_RAP = "Rap"  # Rhyme-focused, rhythmic, slang-heavy
    MUSIC_BALLAD = "Ballad"  # Poetic, lyrical, emotional
    MUSIC_ROCK = "Rock"  # Rebellious, strong
    MUSIC_POP = "Pop"  # Catchy, standard lyrical style

class VietnamesePronoun(str, Enum):
    """
    Defines the relationship pair for Vietnamese translation.
    Format: First Person / Second Person
    """
    # Standard / Social
    TOI_BAN = "Tôi / Bạn"  # Standard, polite, equal status (Social, Work)
    MINH_BAN = "Mình / Bạn"  # Friendly, equal status
    
    # Intimate / Romantic
    ANH_EM = "Anh / Em"  # Romantic (Male to Female), or Elder Brother to Younger Sibling
    EM_ANH = "Em / Anh"  # Romantic (Female to Male), or Younger Sibling to Elder Brother
    
    # Close Friends / Aggressive
    TAO_MAY = "Tao / Mày"  # Very close friends or Aggressive/Rude
    
    # Family
    CON_BO = "Con / Bố"  # Child to Father
    CON_ME = "Con / Mẹ"  # Child to Mother
    BO_CON = "Bố / Con"  # Father to Child
    ME_CON = "Mẹ / Con"  # Mother to Child
    CHAU_BAC = "Cháu / Bác"  # Junior to Senior/Elder
    
    # School / Youth
    CAU_TO = "Cậu / Tớ"  # School friends, innocent
    
    # Historical / Period (Kiem Hiep)
    HUYNH_DE = "Huynh / Đệ"  # Brothers (Martial Arts contexts)
    TAI_HA_CAC_HA = "Tại hạ / Các hạ"  # I / You (Period specific)
    TA_NANG = "Ta / Nàng" # I / You (Period specific)
    TA_NGUOI = "Ta / Ngươi" # I / You (Period specific)

    # Professional
    TOI_QUY_KHACH = "Tôi / Quý khách"  # Service provider to Customer

class ContextAnalysisResult(BaseModel):
    """
    Structured output from the Analysis Pass (Step B).
    """
    detected_style: TranslationStyle = Field(
        ..., 
        description="The dominant style/genre of the content."
    )
    detected_pronouns: Optional[VietnamesePronoun] = Field(
        None, 
        description="The most appropriate pronoun pair for the speakers. Required if target_lang is 'vi'."
    )
    summary: str = Field(
        ..., 
        description="A brief summary of the context, mood, and speaker relationships (max 50 words)."
    )
    keywords: List[str] = Field(
        default_factory=list,
        description="Key terms or proper nouns that should be preserved or handled consistently."
    )

from .llm_provider import LLMProvider

class TranslatorEngine:
    """
    Core Engine for Bilingual Subtitle Translation.
    Follows the 'Analyze First, Translate Second' philosophy.
    """
    
    def __init__(self, config=None):
        self.config = config or {}
        model_name = self.config.get("model_name", "qwen2.5:7b-instruct")
        self.llm_provider = LLMProvider(model_name=model_name)
        logger.info("TranslatorEngine initialized.")

    def _get_analysis_batch(self, segments: List[dict]) -> List[dict]:
        """
        Selects a sample batch for context analysis.
        Logic:
        - If total <= 15: Analyze all.
        - If total > 15: Analyze first 15.
        
        Args:
            segments: List of segment dictionaries (must have 'text' field).
            
        Returns:
            List of segments to be analyzed.
        """
        if not segments:
            return []
            
        limit = 15
        if len(segments) <= limit:
            logger.debug(f"Segment count ({len(segments)}) <= {limit}. Analyzing all.")
            return segments
        else:
            logger.debug(f"Segment count ({len(segments)}) > {limit}. Analyzing first {limit}.")
            return segments[:limit]

    def analyze_content(self, segments: List[dict], target_lang: str) -> ContextAnalysisResult:
        """
        Step A & B: Smart Batching -> Analysis Pass.
        
        Args:
            segments: Full list of audio segments (with 'text' key).
            target_lang: Target language code (e.g., 'vi', 'en').
            
        Returns:
            ContextAnalysisResult containing style and pronouns.
        """
        logger.info(f"Starting Content Analysis for {len(segments)} segments. Target: {target_lang}")
        
        # 1. Smart Batching
        analysis_batch = self._get_analysis_batch(segments)
        text_samples = [s.get('text', '') for s in analysis_batch]
        
        logger.info(f"Analysis Batch prepared. Size: {len(analysis_batch)} segments.")
        
        # 2. LLM Analysis
        result = self.llm_provider.analyze_context(text_samples, target_lang=target_lang)
        
        return result

    def correct_content(self, segments: List[dict]) -> List[dict]:
        """
        Step 1.5: Homophone/ASR Correction.
        Returns a NEW list of segments with 'text' corrected.
        """
        if not segments:
            return []
            
        logger.info(f"Starting Content Correction for {len(segments)} segments.")
        
        # We need to batch this too if the list is huge, but for now let's assume one chunk
        # In production, we'd chunk this by 20-50 lines to avoid context window limits
        
        # 1. Extract text
        texts = [s.get('text', '') for s in segments]
        
        # 2. Analyze context first? Or just correct based on local context?
        # Actually correction needs Style context. So we should analyze -> correct -> re-analyze?
        # That's expensive. 
        # Strategy: Analyze First (on raw text) -> Detect Style -> Correct (using Style) -> Translate.
        
        # For this method, we assume we want to correct. But we need style.
        # Let's do a quick pre-analysis on the first few lines if not provided?
        # To keep it simple for Phase 3: We will pass the 'Context' to this method if available, 
        # or we just use a Generic correction prompt if not.
        
        # Refined Plan: 'process_two_pass' method in Engine will handle the flow.
        return segments # Placeholder if we don't have the context yet.

    def process_two_pass(self, segments: List[dict], target_lang: str) -> List[str]:
        """
        Executes the full "Analyze -> Correct -> Translate" workflow.
        """
        logger.info("Starting Two-Pass Workflow...")
        
        # Pass 1: Analyze (Raw)
        analysis_result = self.analyze_content(segments, target_lang)
        logger.info(f"Initial Analysis: {analysis_result.detected_style}")
        
        # Pass 2: Correct (Using Analysis)
        texts = [s.get('text', '') for s in segments]
        
        # We process correction in batches of 20 to be safe
        corrected_texts = []
        batch_size = 20
        for i in range(0, len(texts), batch_size):
            chunk = texts[i:i+batch_size]
            corrected_chunk = self.llm_provider.correct_text_batch(chunk, analysis_result)
            corrected_texts.extend(corrected_chunk)
            
        logger.info(f"Correction Complete. Sample: {corrected_texts[:1]}")
        
        # Pass 3: Translate (Using Corrected Text & Analysis)
        # We translate in batches of 20 as well
        final_translations = []
        for i in range(0, len(corrected_texts), batch_size):
            chunk = corrected_texts[i:i+batch_size]
            translated_chunk = self.llm_provider.translate_batch(
                chunk, 
                source_lang="auto", # or passed in
                target_lang=target_lang,
                context=analysis_result
            )
            final_translations.extend(translated_chunk)
            
        return final_translations
