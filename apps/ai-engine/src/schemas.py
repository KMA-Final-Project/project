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
    translation: str = Field(
        default="",
        description="Translated text. Always present on serialized artifacts, but may be empty on Tier 1 chunks.",
    )
    phonetic: str = Field(
        default="",
        description="Sentence-level phonetic string. Always present on serialized artifacts, but may be empty.",
    )
    detected_lang: str = Field(
        default="",
        description="Detected source language code for this sentence. Always present on serialized artifacts, but may be empty.",
    )  # ISO code from Whisper per-segment detection
    segment_index: Optional[int] = Field(
        default=None,
        description=(
            "0-indexed global position of this segment in the complete transcript. "
            "Absent (null) on Tier 1 raw chunks where global ordering is not yet known. "
            "Always present as an integer on Tier 2 translated batches and final.json. "
            "Enables matching across artifact layers without relying on array position alone."
        ),
    )


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
# Context analysis models
# ---------------------------------------------------------------------------


class ContextAnalysis(BaseModel):
    """
    Language-pair-aware context analysis result.
    Used by the NMT pipeline for style/pronoun detection.
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


# TranslatedSentence is an alias for Sentence — kept for backward compatibility.
TranslatedSentence = Sentence


# ---------------------------------------------------------------------------
# Phase 4: Output contract models
# ---------------------------------------------------------------------------


class TranslationRevisionSegment(BaseModel):
    segment_index: int
    translation: str = Field(default="")


class TranslationRevisionArtifact(BaseModel):
    revision_index: int
    window_start_segment_index: int
    window_end_segment_index: int
    core_start_segment_index: int
    core_end_segment_index: int
    source_hash: str
    provider: str
    model: str
    status: str
    validation_score: float = 0.0
    created_at: str
    segments: List[TranslationRevisionSegment]


class SegmentTranslationProvenance(BaseModel):
    segment_index: int
    source: str = Field(
        default="nmt",
        description="nmt or llm_revision",
    )
    revision_index: int | None = None


class TranslationFinalizationMetadata(BaseModel):
    enabled: bool = False
    coverage_segments: int = 0
    coverage_duration_seconds: float = 0.0
    attempted_windows: int = 0
    completed_windows: int = 0
    timed_out_windows: int = 0
    invalid_windows: int = 0
    fallback_segments: int = 0
    total_cost_usd: float = 0.0
    finalization_deadline_hit: bool = False
    segment_provenance: List[SegmentTranslationProvenance] = Field(
        default_factory=list
    )


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
    translation_finalization: TranslationFinalizationMetadata = Field(
        default_factory=TranslationFinalizationMetadata
    )


class SubtitleOutput(BaseModel):
    """Complete subtitle output — the canonical final.json payload."""

    metadata: SubtitleMetadata = Field(
        ..., description="Pipeline metadata. Always required on final.json, even when segments is empty."
    )
    segments: List[Sentence] = Field(
        ..., description="Canonical ordered subtitle segments for the completed job."
    )


class TranslatedBatch(BaseModel):
    """A batch of translated segments for Tier 2 streaming uploads."""

    batch_index: int = Field(
        ..., description="0-indexed translated batch number used in the durable MinIO key."
    )
    first_segment_index: int = Field(
        ...,
        description=(
            "0-indexed global position of the first segment in this batch within the "
            "complete transcript. Provides a cheap range anchor for matching this batch "
            "against Tier 1 chunks and the final output without scanning segment arrays."
        ),
    )
    segments: List[Sentence] = Field(
        ..., description="Translated subtitle segments included in this durable Tier 2 batch."
    )
