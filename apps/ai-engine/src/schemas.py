from enum import Enum
from pydantic import BaseModel

class SegmentType(str, Enum):
    HAPPY_CASE = "happy"       # <= 15s, safe for Whisper
    SPECIAL_CASE = "special"   # > 15s, needs Refinement (Word-level split)

class VADSegment(BaseModel):
    start: float
    end: float
    type: SegmentType
    duration: float
