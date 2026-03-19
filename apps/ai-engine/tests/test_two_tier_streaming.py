"""
Tests for MinIO upload path conventions and output contract structure.

Validates:
- Tier 1 chunk path: {mediaId}/chunks/{chunkIndex}.json
- Tier 2 batch path: {mediaId}/translated_batches/{batchIndex}.json
- Final output path: {mediaId}/final.json
- SubtitleOutput JSON contract
"""

from __future__ import annotations

import pytest

from src.schemas import (
    Sentence,
    SubtitleMetadata,
    SubtitleOutput,
    TranslatedBatch,
    Word,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_sentence(index: int, lang: str = "zh") -> Sentence:
    """Factory for a synthetic Sentence with one word."""
    if lang == "zh":
        text = f"测试句子{index}"
        word = Word(
            word=text,
            start=float(index),
            end=float(index) + 1.0,
            confidence=0.95,
            phoneme=f"ce shi ju zi {index}",
        )
    else:
        text = f"Test sentence {index}"
        word = Word(
            word="Test", start=float(index), end=float(index) + 0.5, confidence=0.95
        )
    return Sentence(
        text=text,
        start=float(index),
        end=float(index) + 1.0,
        words=[word],
    )


# ---------------------------------------------------------------------------
# Test: MinIO upload path convention
# ---------------------------------------------------------------------------


class TestMinIOPathConvention:
    """Verify uploaded paths match the Two-Tier convention."""

    def test_tier1_chunk_path(self) -> None:
        """Tier 1 chunks: {mediaId}/chunks/{chunkIndex}.json"""
        from unittest.mock import MagicMock as MM

        minio = MM()
        minio.client = MM()
        minio.bucket_processed = "processed"

        from src.minio_client import MinioClient

        bound = MinioClient.upload_chunk.__get__(minio, MinioClient)
        key, _url = bound("media-123", 0, [{"text": "hello"}])

        assert key == "media-123/chunks/0.json"

    def test_tier2_batch_path(self) -> None:
        """Tier 2 batches: {mediaId}/translated_batches/{batchIndex}.json"""
        from unittest.mock import MagicMock as MM

        minio = MM()
        minio.client = MM()
        minio.bucket_processed = "processed"

        from src.minio_client import MinioClient

        batch = TranslatedBatch(
            batch_index=2,
            segments=[_make_sentence(0)],
        )
        bound = MinioClient.upload_translated_batch.__get__(minio, MinioClient)
        key, _url = bound("media-123", batch)

        assert key == "media-123/translated_batches/2.json"

    def test_final_output_path(self) -> None:
        """Final output: {mediaId}/final.json"""
        from unittest.mock import MagicMock as MM

        minio = MM()
        minio.client = MM()
        minio.bucket_processed = "processed"

        from src.minio_client import MinioClient

        output = SubtitleOutput(
            metadata=SubtitleMetadata(duration=10.0),
            segments=[_make_sentence(0)],
        )
        bound = MinioClient.upload_final_result.__get__(minio, MinioClient)
        key, _url = bound("media-123", output)

        assert key == "media-123/final.json"


# ---------------------------------------------------------------------------
# Test: Output contract structure
# ---------------------------------------------------------------------------


class TestOutputContract:
    """Verify SubtitleOutput matches the required JSON contract."""

    def test_final_json_structure(self) -> None:
        """final.json must have metadata + segments with translation & phonetic."""
        s = Sentence(
            text="你好世界",
            start=0.0,
            end=2.0,
            words=[
                Word(word="你好", start=0.0, end=1.0, confidence=0.9, phoneme="ni hao")
            ],
            translation="Xin chao the gioi",
            phonetic="ni hao",
        )
        output = SubtitleOutput(
            metadata=SubtitleMetadata(
                duration=120.0,
                engine_profile="MEDIUM",
                source_lang="zh",
                target_lang="vi",
                model_used="large-v3",
            ),
            segments=[s],
        )
        d = output.model_dump()

        # Top-level keys
        assert set(d.keys()) == {"metadata", "segments"}

        # Metadata fields
        meta = d["metadata"]
        assert meta["duration"] == 120.0
        assert meta["source_lang"] == "zh"
        assert meta["target_lang"] == "vi"

        # Segment fields -- translation and phonetic always present
        seg = d["segments"][0]
        assert "translation" in seg
        assert "phonetic" in seg
        assert seg["translation"] == "Xin chao the gioi"
        assert seg["phonetic"] == "ni hao"
        assert "words" in seg

    def test_translation_never_none(self) -> None:
        """Sentence.translation defaults to empty string, never None."""
        s = Sentence(text="hello", start=0.0, end=1.0, words=[])
        assert s.translation is not None
        assert isinstance(s.translation, str)

    def test_phonetic_never_none(self) -> None:
        """Sentence.phonetic defaults to empty string, never None."""
        s = Sentence(text="hello", start=0.0, end=1.0, words=[])
        assert s.phonetic is not None
        assert isinstance(s.phonetic, str)
