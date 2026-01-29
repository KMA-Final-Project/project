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

class TranslatorEngine:
    """
    Core Engine for Bilingual Subtitle Translation.
    Follows the 'Analyze First, Translate Second' philosophy.
    """
    
    def __init__(self, config=None):
        self.config = config or {}
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
        
        # 1. smart batching
        analysis_batch = self._get_analysis_batch(segments)
        batch_text = "\n".join([s.get('text', '') for s in analysis_batch])
        
        logger.info(f"Analysis Batch prepared. Size: {len(analysis_batch)} segments.")
        
        # TODO: Phase 2 - Implement LLM Call here.
        # For Phase 1, we return a Mock result.
        
        logger.warning("LLM Integration not implemented yet. Returning MOCK result.")
        
        # Mock Logic for testing Phase 1 structure
        mock_style = TranslationStyle.NEUTRAL
        mock_pronouns = VietnamesePronoun.TOI_BAN if target_lang == 'vi' else None
        
        return ContextAnalysisResult(
            detected_style=mock_style,
            detected_pronouns=mock_pronouns,
            summary="[MOCK] Analysis not implemented. This is a placeholder.",
            keywords=["Mock", "Test"]
        )

    # TODO: Implement translate_batch in Phase 3
