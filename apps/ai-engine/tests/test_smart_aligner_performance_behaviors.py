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
            AssertionError(
                "librosa.load should not be called when audio_array is provided"
            )
        ),
    )
    monkeypatch.setattr(aligner, "_select_batched", lambda language: (object(), False))
    monkeypatch.setattr(
        aligner,
        "_transcribe_segment",
        lambda batched, audio, prompt, language=None, clip_timestamps=None, is_turbo=False: _make_transcription_result(),
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


def test_process_keeps_long_non_cjk_sentence_intact_without_silence_gap(
    monkeypatch,
    tmp_path: Path,
) -> None:
    aligner = _build_aligner()
    audio_array = np.zeros(96000, dtype=np.float32)
    audio_path = tmp_path / "audio.wav"
    audio_path.write_bytes(b"placeholder")
    segments = [
        VADSegment(start=0.0, end=6.0, type=SegmentType.HAPPY_CASE, duration=6.0)
    ]
    words = [
        _make_segment_word(f"word{index}", float(index) * 0.3, float(index) * 0.3 + 0.2)
        for index in range(12)
    ]
    transcription_result = {
        "segments": [
            SimpleNamespace(
                text=" ".join(word.word for word in words),
                no_speech_prob=0.0,
                avg_logprob=-0.1,
                compression_ratio=1.0,
                words=words,
            )
        ],
        "info": SimpleNamespace(language="en"),
        "best_segment": SimpleNamespace(avg_logprob=-0.1, compression_ratio=1.0),
    }

    monkeypatch.setattr(aligner, "_select_batched", lambda language: (object(), False))
    monkeypatch.setattr(
        aligner,
        "_transcribe_segment",
        lambda batched, audio, prompt, language=None, clip_timestamps=None, is_turbo=False: transcription_result,
    )
    monkeypatch.setattr(aligner, "_add_phonemes", lambda sentences, language: None)

    sentences = aligner.process(
        audio_path,
        segments,
        profile="standard",
        audio_array=audio_array,
    )

    assert len(sentences) == 1
    assert len(sentences[0].words) == 12
    assert sentences[0].text == " ".join(f"word{index}" for index in range(12))
