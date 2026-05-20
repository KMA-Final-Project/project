from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import numpy as np

import src.core.smart_aligner as smart_aligner_mod
from src.config import settings
from src.core.smart_aligner import SmartAligner
from src.schemas import SegmentType, Sentence, VADSegment, Word


def _make_segment_word(word: str, start: float, end: float, probability: float = 0.95):
    return SimpleNamespace(word=word, start=start, end=end, probability=probability)


def _make_transcription_result(language: str = "en"):
    segment = SimpleNamespace(
        text="hello",
        no_speech_prob=0.0,
        avg_logprob=-0.1,
        compression_ratio=1.0,
        words=[_make_segment_word("hello", 0.0, 0.5)],
    )
    info = SimpleNamespace(language=language)
    return {"segments": [segment], "info": info, "best_segment": segment}


def _build_aligner() -> SmartAligner:
    return object.__new__(SmartAligner)


def test_smart_aligner_uses_supplied_audio_array_without_loading_from_librosa(
    monkeypatch,
    tmp_path: Path,
) -> None:
    aligner = _build_aligner()
    audio_array = np.zeros(32000, dtype=np.float32)
    audio_path = tmp_path / "audio.wav"
    audio_path.write_bytes(b"placeholder")
    segments = [
        VADSegment(start=0.0, end=1.0, type=SegmentType.HAPPY_CASE, duration=1.0)
    ]

    monkeypatch.setattr(
        smart_aligner_mod.librosa,
        "load",
        lambda *args, **kwargs: (_ for _ in ()).throw(
            AssertionError("librosa.load should not be called when audio_array is provided")
        ),
    )
    monkeypatch.setattr(aligner, "_select_batched", lambda language: object())
    monkeypatch.setattr(
        aligner,
        "_transcribe_segment",
        lambda batched, audio, prompt, language=None: _make_transcription_result(),
    )

    sentences = aligner.process(
        audio_path,
        segments,
        profile="standard",
        audio_array=audio_array,
    )

    assert len(sentences) == 1
    assert sentences[0].text == "hello"


def test_group_segments_uses_configured_group_size() -> None:
    aligner = _build_aligner()
    original_group_size = settings.SMART_ALIGNER_GROUP_SIZE
    settings.SMART_ALIGNER_GROUP_SIZE = 2
    try:
        segments = [
            VADSegment(
                start=float(index),
                end=float(index) + 1.0,
                type=SegmentType.HAPPY_CASE,
                duration=1.0,
            )
            for index in range(5)
        ]

        groups = aligner._group_segments(segments)

        assert [len(group) for group in groups] == [2, 2, 1]
    finally:
        settings.SMART_ALIGNER_GROUP_SIZE = original_group_size


def test_split_long_sentences_limits_non_cjk_word_count() -> None:
    aligner = _build_aligner()
    original_max_words = settings.SUBTITLE_MAX_WORDS
    settings.SUBTITLE_MAX_WORDS = 5
    try:
        words = [
            Word(
                word=f"word{index}",
                start=float(index),
                end=float(index) + 0.4,
                confidence=0.99,
            )
            for index in range(12)
        ]
        sentence = Sentence(
            text=" ".join(word.word for word in words),
            start=words[0].start,
            end=words[-1].end,
            words=words,
        )

        split_sentences = aligner._split_long_sentences(sentence)

        assert len(split_sentences) >= 3
        assert all(len(item.text.split()) <= 5 for item in split_sentences)
    finally:
        settings.SUBTITLE_MAX_WORDS = original_max_words