from enum import Enum
from pydantic import BaseModel, Field

from typing import List, Optional


class SegmentType(str, Enum):
    HAPPY_CASE = "happy"  # <= 15s, safe for Whisper
    SPECIAL_CASE = "special"  # > 15s, needs Refinement (Word-level split)


class VADSegment(BaseModel):
    start: float
    end: float
    type: SegmentType
    duration: float


class Word(BaseModel):
    word: str
    start: float
    end: float
    confidence: float
    phoneme: str | None = None


class Sentence(BaseModel):
    text: str
    start: float
    end: float
    words: List[Word]  # Crucial for Karaoke
    translation: str = ""
    phonetic: str = ""
    detected_lang: str = ""  # ISO code from Whisper per-segment detection


class TranslationStyle(str, Enum):
    """
    Defines the tone and style of the translation.
    Used to guide the LLM's output personality.
    """

    # --- GENERAL / SOCIAL ---
    FORMAL = "Formal"
    CASUAL = "Casual"
    NEUTRAL = "Neutral"
    SLANG = "Slang"

    # --- MEDIA / CONTENT ---
    NEWS = "News"
    DOCUMENTARY = "Documentary"
    INTERVIEW = "Interview"
    PODCAST = "Podcast"
    VLOG = "Vlog"
    TECH_REVIEW = "Tech Review"
    GAMING = "Gaming"

    # --- MOVIES / FICTION ---
    ACTION = "Action"
    COMEDY = "Comedy"
    DRAMA = "Drama"
    HORROR = "Horror"
    SCI_FI = "Sci-Fi"
    ROMANCE = "Romance"
    HISTORICAL = "Historical"

    # --- MUSIC ---
    MUSIC_RAP = "Rap"
    MUSIC_BALLAD = "Ballad"
    MUSIC_ROCK = "Rock"
    MUSIC_POP = "Pop"


class VietnamesePronoun(str, Enum):
    """
    Defines the relationship pair for Vietnamese translation.
    Format: First Person / Second Person
    """

    TOI_BAN = "Tôi / Bạn"
    MINH_BAN = "Mình / Bạn"
    ANH_EM = "Anh / Em"
    EM_ANH = "Em / Anh"
    TAO_MAY = "Tao / Mày"
    CON_BO = "Con / Bố"
    CON_ME = "Con / Mẹ"
    BO_CON = "Bố / Con"
    ME_CON = "Mẹ / Con"
    CHAU_BAC = "Cháu / Bác"
    CAU_TO = "Cậu / Tớ"
    HUYNH_DE = "Huynh / Đệ"
    TAI_HA_CAC_HA = "Tại hạ / Các hạ"
    TA_NANG = "Ta / Nàng"
    TA_NGUOI = "Ta / Ngươi"
    TOI_QUY_KHACH = "Tôi / Quý khách"


class ContextAnalysisResult(BaseModel):
    """
    Structured output from the LLM context analysis pass.
    Used by LLMProvider.analyze_context() — kept for backward compatibility.
    """

    detected_style: TranslationStyle = Field(
        ..., description="The dominant style/genre of the content."
    )
    detected_pronouns: Optional[VietnamesePronoun] = Field(
        None,
        description="The most appropriate pronoun pair for the speakers. Required if target_lang is 'vi'.",
    )
    summary: str = Field(
        ...,
        description="A brief summary of the context, mood, and speaker relationships (max 50 words).",
    )
    keywords: List[str] = Field(
        default_factory=list,
        description="Key terms or proper nouns that should be preserved or handled consistently.",
    )


# ---------------------------------------------------------------------------
# Phase 3: New models for TranslatorEngine
# ---------------------------------------------------------------------------


class ContextAnalysis(BaseModel):
    """
    Language-pair-aware context analysis result.
    Used internally by TranslatorEngine — not tied to any specific target language.
    """

    detected_style: TranslationStyle = Field(
        default=TranslationStyle.NEUTRAL,
        description="The dominant style/genre of the content.",
    )
    summary: str = Field(
        default="", description="Brief context summary (max 50 words)."
    )
    keywords: List[str] = Field(
        default_factory=list,
        description="Key terms or proper nouns to preserve consistently.",
    )
    language_specific: dict = Field(
        default_factory=dict,
        description='Language-specific data, e.g. {"pronouns": "Tôi / Bạn"} for vi, {} for en.',
    )


# TranslatedSentence is identical to Sentence after Phase 4 — kept as alias
# so Phase 3 code (TranslatorEngine) continues to work unchanged.
TranslatedSentence = Sentence


class LanguageConfig(BaseModel):
    """Registry entry describing target-language-specific translation behavior."""

    code: str = Field(..., description="ISO 639-1 code, e.g. 'vi', 'en'.")
    name: str = Field(..., description="Human-readable name, e.g. 'Vietnamese'.")
    prompt_key: str = Field(
        ..., description="Key to look up the prompt template in prompts.py."
    )
    has_pronouns: bool = Field(
        default=False,
        description="Whether pronoun detection matters for this language.",
    )


# ---------------------------------------------------------------------------
# Phase 4: Output contract models
# ---------------------------------------------------------------------------


class SubtitleMetadata(BaseModel):
    """Metadata about the pipeline run, included in the final output."""

    duration: float = Field(default=0.0, description="Audio duration in seconds.")
    engine_profile: str = Field(
        default="MEDIUM", description="AI performance profile used."
    )
    source_lang: str = Field(default="", description="Detected source language code.")
    target_lang: str = Field(
        default="", description="Target translation language code."
    )
    model_used: str = Field(
        default="", description="Whisper model name used for transcription."
    )


class SubtitleOutput(BaseModel):
    """Complete subtitle output — the canonical final.json payload."""

    metadata: SubtitleMetadata
    segments: List[Sentence]


class TranslatedBatch(BaseModel):
    """A batch of translated segments for Tier 2 streaming uploads."""

    batch_index: int
    segments: List[Sentence]
