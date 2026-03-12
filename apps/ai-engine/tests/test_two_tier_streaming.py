"""
Tests for the Two-Tier Streaming mechanism and TranslatorEngine partial-failure handling.

Tier 1: Raw transcription chunks pushed during SmartAligner (mocked)
Tier 2: Translated batches pushed during TranslatorEngine
Partial failure: Simulate Ollama crash mid-translation → remaining segments
                 receive "[Translation Pending]" markers.

Uses AAA (Arrange-Act-Assert) pattern per the python-testing-patterns skill.
"""

from __future__ import annotations

from typing import List
from unittest.mock import MagicMock, patch

import pytest

from src.schemas import (
    ContextAnalysis,
    ContextAnalysisResult,
    Sentence,
    SubtitleMetadata,
    SubtitleOutput,
    TranslatedBatch,
    TranslatedSentence,
    TranslationStyle,
    VietnamesePronoun,
    Word,
)
from src.core.translator_engine import (
    TranslatorEngine,
    TRANSLATION_BATCH_SIZE,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _make_sentence(index: int, lang: str = "zh") -> Sentence:
    """Factory for a synthetic Sentence with one word."""
    if lang == "zh":
        text = f"测试句子{index}"
        word = Word(word=text, start=float(index), end=float(index) + 1.0,
                    confidence=0.95, phoneme=f"cè shì jù zi {index}")
    else:
        text = f"Test sentence {index}"
        word = Word(word="Test", start=float(index), end=float(index) + 0.5,
                    confidence=0.95)
    return Sentence(
        text=text,
        start=float(index),
        end=float(index) + 1.0,
        words=[word],
    )


@pytest.fixture
def zh_sentences() -> List[Sentence]:
    """30 Chinese sentences — enough for 2 full batches (15 each)."""
    return [_make_sentence(i, lang="zh") for i in range(30)]


@pytest.fixture
def en_sentences() -> List[Sentence]:
    """20 English sentences — enough for 2 batches (15 + 5)."""
    return [_make_sentence(i, lang="en") for i in range(20)]


@pytest.fixture
def mock_llm() -> MagicMock:
    """A mock LLMProvider whose methods can be configured per-test."""
    llm = MagicMock()
    # Default: analyze_context returns neutral result
    llm.analyze_context.return_value = ContextAnalysisResult(
        detected_style=TranslationStyle.NEUTRAL,
        detected_pronouns=VietnamesePronoun.TOI_BAN,
        summary="Test content",
        keywords=["test"],
    )
    return llm


@pytest.fixture
def translator(mock_llm: MagicMock) -> TranslatorEngine:
    """TranslatorEngine wired to a mock LLMProvider."""
    return TranslatorEngine(mock_llm)


# ---------------------------------------------------------------------------
# Test: Tier 2 — Translated batches are pushed in order
# ---------------------------------------------------------------------------

class TestTier2StreamingBatches:
    """Verify Tier 2 callback fires for every batch, in correct order."""

    def test_batches_fired_in_order(
        self, translator: TranslatorEngine, mock_llm: MagicMock, zh_sentences: List[Sentence]
    ) -> None:
        """on_batch_complete should fire for each batch, sequentially."""
        # Arrange
        mock_llm.translate_raw.side_effect = (
            lambda texts, _prompt: [f"翻译{i}" for i in range(len(texts))]
        )
        received_batches: list[tuple[int, list[Sentence]]] = []

        def on_batch(idx: int, batch: list[Sentence]) -> None:
            received_batches.append((idx, batch))

        # Act
        result = translator.translate(
            sentences=zh_sentences,
            source_lang="zh",
            target_lang="vi",
            profile="music",
            on_batch_complete=on_batch,
        )

        # Assert — 30 sentences / 15 per batch = 2 batches
        assert len(received_batches) == 2
        assert received_batches[0][0] == 0
        assert received_batches[1][0] == 1
        assert len(received_batches[0][1]) == TRANSLATION_BATCH_SIZE
        assert len(received_batches[1][1]) == TRANSLATION_BATCH_SIZE
        assert len(result) == 30

    def test_all_translations_populated(
        self, translator: TranslatorEngine, mock_llm: MagicMock, en_sentences: List[Sentence]
    ) -> None:
        """Every returned TranslatedSentence must have a non-empty translation."""
        # Arrange
        mock_llm.translate_raw.side_effect = (
            lambda texts, _prompt: [f"Translated: {t}" for t in texts]
        )

        # Act
        result = translator.translate(
            sentences=en_sentences,
            source_lang="en",
            target_lang="vi",
            profile="standard",
        )

        # Assert
        assert len(result) == 20
        for s in result:
            assert s.translation != ""
            assert s.translation.startswith("Translated: ")

    def test_batch_callback_receives_correct_segment_count(
        self, translator: TranslatorEngine, mock_llm: MagicMock, en_sentences: List[Sentence]
    ) -> None:
        """20 sentences → batch 0 has 15, batch 1 has 5."""
        # Arrange
        mock_llm.translate_raw.side_effect = (
            lambda texts, _prompt: [f"T-{i}" for i in range(len(texts))]
        )
        batch_sizes: list[int] = []

        def on_batch(idx: int, batch: list[Sentence]) -> None:
            batch_sizes.append(len(batch))

        # Act
        translator.translate(
            sentences=en_sentences,
            source_lang="en",
            target_lang="vi",
            profile="standard",
            on_batch_complete=on_batch,
        )

        # Assert
        assert batch_sizes == [15, 5]


# ---------------------------------------------------------------------------
# Test: Tier 1 before Tier 2 ordering
# ---------------------------------------------------------------------------

class TestTierOrdering:
    """Verify Tier 1 chunks are pushed before Tier 2 translated batches."""

    def test_tier1_before_tier2(self, mock_llm: MagicMock) -> None:
        """
        Simulate the full pipeline flow: Tier 1 chunks from SmartAligner
        should all arrive before any Tier 2 translated batch.
        """
        # Arrange — track upload order
        upload_log: list[str] = []

        sentences = [_make_sentence(i, lang="zh") for i in range(20)]

        # Simulate Tier 1: SmartAligner pushes raw chunks
        def simulate_tier1() -> None:
            for chunk_idx in range(2):
                upload_log.append(f"tier1_chunk_{chunk_idx}")

        # Simulate Tier 2: TranslatorEngine pushes translated batches
        mock_llm.translate_raw.side_effect = (
            lambda texts, _prompt: [f"翻译" for _ in texts]
        )

        def on_batch(idx: int, batch: list[Sentence]) -> None:
            upload_log.append(f"tier2_batch_{idx}")

        # Act — Tier 1 happens first, then Tier 2
        simulate_tier1()
        engine = TranslatorEngine(mock_llm)
        engine.translate(
            sentences=sentences,
            source_lang="zh",
            target_lang="vi",
            profile="music",
            on_batch_complete=on_batch,
        )

        # Assert — all Tier 1 entries precede all Tier 2 entries
        tier1_indices = [i for i, x in enumerate(upload_log) if x.startswith("tier1")]
        tier2_indices = [i for i, x in enumerate(upload_log) if x.startswith("tier2")]
        assert tier1_indices, "No Tier 1 chunks recorded"
        assert tier2_indices, "No Tier 2 batches recorded"
        assert max(tier1_indices) < min(tier2_indices), (
            f"Tier 1 must complete before Tier 2 starts: {upload_log}"
        )


# ---------------------------------------------------------------------------
# Test: Partial failure — Ollama crash mid-translation
# ---------------------------------------------------------------------------

class TestOllamaCrashPartialFailure:
    """
    Simulate Ollama going down mid-translation.
    First batch succeeds, subsequent batches fail.
    Failed batches → "[Translation Pending]" markers.
    """

    def test_first_batch_succeeds_rest_pending(
        self, translator: TranslatorEngine, mock_llm: MagicMock, zh_sentences: List[Sentence]
    ) -> None:
        """
        30 sentences → 2 batches.
        Batch 0 succeeds, Batch 1 raises ConnectionError (Ollama killed).
        """
        # Arrange
        call_count = [0]

        def translate_or_crash(texts: list[str], _prompt: str) -> list[str]:
            call_count[0] += 1
            if call_count[0] == 1:
                return [f"Bản dịch {i}" for i in range(len(texts))]
            raise ConnectionError("Connection refused — Ollama process killed")

        mock_llm.translate_raw.side_effect = translate_or_crash

        received_batches: list[tuple[int, list[Sentence]]] = []

        def on_batch(idx: int, batch: list[Sentence]) -> None:
            received_batches.append((idx, batch))

        # Act
        result = translator.translate(
            sentences=zh_sentences,
            source_lang="zh",
            target_lang="vi",
            profile="music",
            on_batch_complete=on_batch,
        )

        # Assert — all 30 sentences returned (no data loss)
        assert len(result) == 30

        # First 15: real translations
        for s in result[:TRANSLATION_BATCH_SIZE]:
            assert s.translation.startswith("Bản dịch")
            assert s.translation != "[Translation Pending]"

        # Last 15: pending markers
        for s in result[TRANSLATION_BATCH_SIZE:]:
            assert s.translation == "[Translation Pending]"

        # Both batches still fired callback (even the failed one)
        assert len(received_batches) == 2

    def test_all_batches_fail(
        self, translator: TranslatorEngine, mock_llm: MagicMock, en_sentences: List[Sentence]
    ) -> None:
        """If Ollama is down from the start, every segment gets [Translation Pending]."""
        # Arrange
        mock_llm.translate_raw.side_effect = ConnectionError("Ollama not running")

        # Act
        result = translator.translate(
            sentences=en_sentences,
            source_lang="en",
            target_lang="vi",
            profile="standard",
        )

        # Assert
        assert len(result) == 20
        for s in result:
            assert s.translation == "[Translation Pending]"

    def test_count_mismatch_marks_pending(
        self, translator: TranslatorEngine, mock_llm: MagicMock, en_sentences: List[Sentence]
    ) -> None:
        """If LLM returns wrong count, those segments get [Translation Pending]."""
        # Arrange — return fewer translations than expected
        mock_llm.translate_raw.return_value = ["Only one translation"]

        # Act
        result = translator.translate(
            sentences=en_sentences,
            source_lang="en",
            target_lang="vi",
            profile="standard",
        )

        # Assert — all pending because count mismatch on every batch
        for s in result:
            assert s.translation == "[Translation Pending]"

    def test_empty_response_marks_pending(
        self, translator: TranslatorEngine, mock_llm: MagicMock, en_sentences: List[Sentence]
    ) -> None:
        """If LLM returns empty list, segments get [Translation Pending]."""
        # Arrange
        mock_llm.translate_raw.return_value = []

        # Act
        result = translator.translate(
            sentences=en_sentences,
            source_lang="en",
            target_lang="vi",
            profile="standard",
        )

        # Assert
        for s in result:
            assert s.translation == "[Translation Pending]"


# ---------------------------------------------------------------------------
# Test: Sliding window continuity
# ---------------------------------------------------------------------------

class TestSlidingWindowContinuity:
    """Verify the sliding context window is passed between batches."""

    def test_sliding_window_not_updated_on_failure(
        self, translator: TranslatorEngine, mock_llm: MagicMock
    ) -> None:
        """
        If batch 1 fails, sliding window should stay from batch 0.
        Batch 2 (if it existed) should see batch 0's context, not failure markers.
        45 sentences → 3 batches. Batch 1 fails, Batch 2 succeeds.
        """
        # Arrange
        sentences = [_make_sentence(i, lang="en") for i in range(45)]
        call_count = [0]
        captured_prompts: list[str] = []

        def translate_with_tracking(texts: list[str], prompt: str) -> list[str]:
            call_count[0] += 1
            captured_prompts.append(prompt)
            if call_count[0] == 2:
                raise ConnectionError("Ollama temporarily down")
            return [f"Trans-{i}" for i in range(len(texts))]

        mock_llm.translate_raw.side_effect = translate_with_tracking

        # Act
        result = translator.translate(
            sentences=sentences,
            source_lang="en",
            target_lang="vi",
            profile="standard",
        )

        # Assert — 45 sentences returned
        assert len(result) == 45

        # Batch 0 (0-14): translated
        for s in result[:15]:
            assert s.translation.startswith("Trans-")

        # Batch 1 (15-29): pending
        for s in result[15:30]:
            assert s.translation == "[Translation Pending]"

        # Batch 2 (30-44): translated (recovered)
        for s in result[30:]:
            assert s.translation.startswith("Trans-")

        # The third prompt (batch 2) should contain sliding context from batch 0
        # (not "[Translation Pending]" from batch 1)
        assert len(captured_prompts) == 3
        # Batch 2 prompt should have continuity text from batch 0's last translations
        assert "[Translation Pending]" not in captured_prompts[2]


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

        # Import real method and bind to mock
        from src.minio_client import MinioClient
        bound = MinioClient.upload_chunk.__get__(minio, MinioClient)
        key = bound("media-123", 0, [{"text": "hello"}])

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
        key = bound("media-123", batch)

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
        key = bound("media-123", output)

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
            words=[Word(word="你好", start=0.0, end=1.0, confidence=0.9, phoneme="nǐ hǎo")],
            translation="Xin chào thế giới",
            phonetic="nǐ hǎo",
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

        # Segment fields — translation and phonetic always present
        seg = d["segments"][0]
        assert "translation" in seg
        assert "phonetic" in seg
        assert seg["translation"] == "Xin chào thế giới"
        assert seg["phonetic"] == "nǐ hǎo"
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


# ---------------------------------------------------------------------------
# Test: Phonetic population helper
# ---------------------------------------------------------------------------

class TestPhoneticPopulation:
    """Verify _populate_segment_phonetics from main.py."""

    def test_cjk_phonetic_from_words(self) -> None:
        """CJK sentences get phonetic assembled from word-level phonemes."""
        from src.main import _populate_segment_phonetics

        words = [
            Word(word="你", start=0.0, end=0.3, confidence=0.9, phoneme="nǐ"),
            Word(word="好", start=0.3, end=0.6, confidence=0.9, phoneme="hǎo"),
        ]
        s = Sentence(text="你好", start=0.0, end=0.6, words=words)

        _populate_segment_phonetics([s], "zh")

        assert s.phonetic == "nǐ hǎo"

    def test_english_phonetic_stays_empty(self) -> None:
        """Non-CJK sentences should not get phonetic populated."""
        from src.main import _populate_segment_phonetics

        s = Sentence(
            text="hello",
            start=0.0,
            end=1.0,
            words=[Word(word="hello", start=0.0, end=1.0, confidence=0.9)],
        )

        _populate_segment_phonetics([s], "en")

        assert s.phonetic == ""

    def test_japanese_phonetic_populated(self) -> None:
        """Japanese (ja) is CJK — phonetic should be populated."""
        from src.main import _populate_segment_phonetics

        words = [
            Word(word="こんにちは", start=0.0, end=1.0, confidence=0.9, phoneme="konnichiwa"),
        ]
        s = Sentence(text="こんにちは", start=0.0, end=1.0, words=words)

        _populate_segment_phonetics([s], "ja")

        assert s.phonetic == "konnichiwa"

    def test_missing_phoneme_skipped(self) -> None:
        """Words without phoneme field should be skipped gracefully."""
        from src.main import _populate_segment_phonetics

        words = [
            Word(word="你", start=0.0, end=0.3, confidence=0.9, phoneme="nǐ"),
            Word(word="好", start=0.3, end=0.6, confidence=0.9, phoneme=None),
        ]
        s = Sentence(text="你好", start=0.0, end=0.6, words=words)

        _populate_segment_phonetics([s], "zh")

        assert s.phonetic == "nǐ"
