from enum import Enum
from pydantic import BaseModel

from typing import List

class SegmentType(str, Enum):
    HAPPY_CASE = "happy"       # <= 15s, safe for Whisper
    SPECIAL_CASE = "special"   # > 15s, needs Refinement (Word-level split)

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
