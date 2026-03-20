from __future__ import annotations

import json
from typing import Any

import pytest

from src.minio_client import MinioClient
from src.schemas import Sentence, SubtitleMetadata, SubtitleOutput, TranslatedBatch, Word

REQUIRED_WORD_KEYS = {"word", "start", "end", "confidence", "phoneme"}
REQUIRED_SENTENCE_KEYS = {
    "text",
    "start",
    "end",
    "words",
    "translation",
    "phonetic",
    "detected_lang",
    "segment_index",  # Explicit identity field: null on Tier 1 chunks, int on batches/final
}
REQUIRED_METADATA_KEYS = {
    "duration",
    "engine_profile",
    "source_lang",
    "target_lang",
    "model_used",
}
REQUIRED_BATCH_KEYS = {
    "batch_index",
    "first_segment_index",  # Explicit range anchor for cross-artifact matching
    "segments",
}


class RecordingPutClient:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    def put_object(
        self,
        bucket_name: str,
        object_name: str,
        data,
        length: int,
        content_type: str,
    ) -> None:
        body = data.read()
        self.calls.append(
            {
                "bucket_name": bucket_name,
                "object_name": object_name,
                "body": body,
                "length": length,
                "content_type": content_type,
            }
        )


@pytest.fixture
def minio_double() -> MinioClient:
    client = object.__new__(MinioClient)
    client.client = RecordingPutClient()
    client.bucket_processed = "processed"
    client.get_presigned_url = lambda object_key, expires=3600: (
        f"http://fake/{object_key}?expires={expires}"
    )
    return client


def _make_sentence(
    index: int,
    *,
    translation: str = "",
    phonetic: str = "",
    detected_lang: str = "en",
    word_phoneme: str | None = None,
    segment_index: int | None = None,
) -> Sentence:
    text = f"Line {index}"
    return Sentence(
        text=text,
        start=float(index),
        end=float(index) + 0.8,
        words=[
            Word(
                word=text,
                start=float(index),
                end=float(index) + 0.8,
                confidence=0.95,
                phoneme=word_phoneme,
            )
        ],
        translation=translation,
        phonetic=phonetic,
        detected_lang=detected_lang,
        segment_index=segment_index,
    )


def _last_put_json(minio: MinioClient) -> Any:
    call = minio.client.calls[-1]
    assert call["content_type"] == "application/json"
    assert call["length"] == len(call["body"])
    return json.loads(call["body"].decode("utf-8"))


def _assert_word_contract(word: dict[str, Any]) -> None:
    assert set(word.keys()) == REQUIRED_WORD_KEYS
    assert isinstance(word["word"], str)
    assert isinstance(word["start"], (int, float))
    assert isinstance(word["end"], (int, float))
    assert isinstance(word["confidence"], (int, float))
    assert word["phoneme"] is None or isinstance(word["phoneme"], str)


def _assert_sentence_contract(sentence: dict[str, Any]) -> None:
    assert set(sentence.keys()) == REQUIRED_SENTENCE_KEYS
    assert isinstance(sentence["text"], str)
    assert isinstance(sentence["start"], (int, float))
    assert isinstance(sentence["end"], (int, float))
    assert isinstance(sentence["words"], list)
    assert isinstance(sentence["translation"], str)
    assert isinstance(sentence["phonetic"], str)
    assert isinstance(sentence["detected_lang"], str)
    # segment_index is None on Tier 1 raw chunks; always an int on batches/final
    assert sentence["segment_index"] is None or isinstance(
        sentence["segment_index"], int
    ), f"segment_index must be None or int, got {type(sentence['segment_index'])}"
    for word in sentence["words"]:
        _assert_word_contract(word)


@pytest.mark.parametrize(
    ("helper_name", "args", "expected"),
    [
        ("chunk_object_key", ("media-123", 0), "media-123/chunks/0.json"),
        (
            "translated_batch_object_key",
            ("media-123", 2),
            "media-123/translated_batches/2.json",
        ),
        ("final_result_object_key", ("media-123",), "media-123/final.json"),
    ],
)
def test_minio_path_helpers_freeze_the_canonical_artifact_keys(
    helper_name: str,
    args: tuple[Any, ...],
    expected: str,
) -> None:
    helper = getattr(MinioClient, helper_name)
    assert helper(*args) == expected


def test_chunk_artifact_is_a_flat_sentence_array_with_no_wrapper(
    minio_double: MinioClient,
) -> None:
    # Raw Tier 1 chunks: segment_index is None (global ordering not yet known)
    chunk = [_make_sentence(0).model_dump(), _make_sentence(1).model_dump()]

    key, url = minio_double.upload_chunk("media-123", 4, chunk)
    payload = _last_put_json(minio_double)

    assert key == MinioClient.chunk_object_key("media-123", 4)
    assert url.startswith(f"http://fake/{key}")
    assert isinstance(payload, list)
    assert len(payload) == 2
    for sentence in payload:
        _assert_sentence_contract(sentence)
        # Tier 1 chunks must carry segment_index=None — global index is unknown at
        # transcription time. Consumers must not rely on array position as identity.
        assert sentence["segment_index"] is None, (
            f"Tier 1 chunk segment must have segment_index=null, "
            f"got {sentence['segment_index']!r}"
        )


def test_translated_batch_artifact_wraps_segments_with_batch_metadata(
    minio_double: MinioClient,
) -> None:
    batch = TranslatedBatch(
        batch_index=2,
        first_segment_index=10,
        segments=[
            _make_sentence(
                0,
                translation="Xin chào",
                phonetic="xin chao",
                detected_lang="zh",
                word_phoneme="ni hao",
                segment_index=10,
            )
        ],
    )

    key, url = minio_double.upload_translated_batch("media-123", batch)
    payload = _last_put_json(minio_double)

    assert key == MinioClient.translated_batch_object_key("media-123", 2)
    assert url.startswith(f"http://fake/{key}")
    assert set(payload.keys()) == REQUIRED_BATCH_KEYS
    assert payload["batch_index"] == 2
    assert payload["first_segment_index"] == 10
    assert isinstance(payload["segments"], list)
    assert len(payload["segments"]) == 1
    _assert_sentence_contract(payload["segments"][0])
    assert "metadata" not in payload


def test_final_output_is_the_only_artifact_with_metadata(
    minio_double: MinioClient,
) -> None:
    output = SubtitleOutput(
        metadata=SubtitleMetadata(
            duration=120.0,
            engine_profile="MEDIUM",
            source_lang="zh",
            target_lang="vi",
            model_used="large-v3",
        ),
        segments=[
            _make_sentence(
                0,
                translation="Xin chào thế giới",
                phonetic="xin chao the gioi",
                detected_lang="zh",
                word_phoneme="ni hao",
                segment_index=0,
            )
        ],
    )

    key, url = minio_double.upload_final_result("media-123", output)
    payload = _last_put_json(minio_double)

    assert key == MinioClient.final_result_object_key("media-123")
    assert url.startswith(f"http://fake/{key}")
    assert set(payload.keys()) == {"metadata", "segments"}
    assert set(payload["metadata"].keys()) == REQUIRED_METADATA_KEYS
    assert payload["metadata"]["duration"] == 120.0
    assert payload["metadata"]["source_lang"] == "zh"
    assert payload["metadata"]["target_lang"] == "vi"
    assert isinstance(payload["segments"], list)
    assert len(payload["segments"]) == 1
    _assert_sentence_contract(payload["segments"][0])
    assert "batch_index" not in payload


def test_sentence_contract_keeps_string_fields_present_even_when_empty() -> None:
    sentence = Sentence(
        text="hello",
        start=0.0,
        end=1.0,
        words=[Word(word="hello", start=0.0, end=1.0, confidence=0.9)],
    )

    dumped = sentence.model_dump()

    _assert_sentence_contract(dumped)
    assert dumped["translation"] == ""
    assert dumped["phonetic"] == ""
    assert dumped["detected_lang"] == ""
    assert dumped["segment_index"] is None
    assert dumped["words"][0]["phoneme"] is None


def test_final_output_allows_empty_segments_but_not_missing_metadata() -> None:
    output = SubtitleOutput(
        metadata=SubtitleMetadata(duration=0.0, target_lang="vi"),
        segments=[],
    )

    dumped = output.model_dump()

    assert set(dumped.keys()) == {"metadata", "segments"}
    assert set(dumped["metadata"].keys()) == REQUIRED_METADATA_KEYS
    assert dumped["segments"] == []


# ---------------------------------------------------------------------------
# Explicit segment identity and matching metadata contract
# ---------------------------------------------------------------------------


def test_tier1_chunk_segment_index_is_null() -> None:
    """Raw Tier 1 chunk sentences must carry segment_index=None.

    Global ordering is not yet known at transcription time. Downstream consumers
    must treat segment_index=None as the explicit signal that array position is
    the *only* available ordering handle at this artifact layer.
    """
    sentence = _make_sentence(0, detected_lang="en")
    assert sentence.segment_index is None
    dumped = sentence.model_dump()
    assert dumped["segment_index"] is None


def test_translated_batch_segment_index_is_coherent_with_first_segment_index() -> None:
    """segment_index on each batch segment must equal first_segment_index + offset.

    This is the core matching contract: a consumer that receives a batch can map
    every segment to its global position without scanning any other artifact.
    """
    first_idx = 7
    segments = [
        _make_sentence(i, segment_index=first_idx + i) for i in range(3)
    ]
    batch = TranslatedBatch(
        batch_index=1,
        first_segment_index=first_idx,
        segments=segments,
    )
    dumped = batch.model_dump()

    assert dumped["first_segment_index"] == first_idx
    for offset, seg in enumerate(dumped["segments"]):
        assert seg["segment_index"] == first_idx + offset, (
            f"Segment at offset {offset}: expected segment_index={first_idx + offset}, "
            f"got {seg['segment_index']}"
        )
    # first_segment_index must equal the first segment's own segment_index
    assert dumped["first_segment_index"] == dumped["segments"][0]["segment_index"]


def test_final_output_segments_have_sequential_segment_indices() -> None:
    """Final output segments must have consecutive, 0-based segment_index values.

    This is the authoritative ordering signal for consumers reconstructing the
    complete transcript from partial artifact layers.
    """
    n = 4
    segments = [_make_sentence(i, segment_index=i) for i in range(n)]
    output = SubtitleOutput(
        metadata=SubtitleMetadata(duration=10.0, target_lang="vi"),
        segments=segments,
    )
    dumped = output.model_dump()

    for i, seg in enumerate(dumped["segments"]):
        assert seg["segment_index"] == i, (
            f"Final segment at position {i}: expected segment_index={i}, "
            f"got {seg['segment_index']}"
        )


def test_translated_batch_first_segment_index_matches_first_segment(
    minio_double: MinioClient,
) -> None:
    """first_segment_index in the serialized batch artifact must match
    segment_index of the first segment — no off-by-one, no stale value.
    """
    first_idx = 15
    batch = TranslatedBatch(
        batch_index=3,
        first_segment_index=first_idx,
        segments=[
            _make_sentence(0, segment_index=first_idx),
            _make_sentence(1, segment_index=first_idx + 1),
        ],
    )
    minio_double.upload_translated_batch("media-x", batch)
    payload = _last_put_json(minio_double)

    assert payload["first_segment_index"] == payload["segments"][0]["segment_index"]
    assert payload["segments"][1]["segment_index"] == first_idx + 1


def test_segment_identity_is_usable_for_matching_across_batch_and_final() -> None:
    """Demonstrate that segment_index provides a materially usable matching key.

    Simulates the mobile-side use-case: given a translated batch and a final
    output, find which final segments correspond to the batch without array-
    position comparison. This confirms the field is not ornamental.
    """
    # Simulate a translated batch covering segments 5-7
    first_idx = 5
    batch_segments = [
        _make_sentence(i, translation=f"trans {i}", segment_index=first_idx + i)
        for i in range(3)
    ]
    batch = TranslatedBatch(
        batch_index=2,
        first_segment_index=first_idx,
        segments=batch_segments,
    )

    # Simulate a final output with the same segments at arbitrary array positions
    all_segments = [_make_sentence(j, segment_index=j) for j in range(10)]

    # Consumer matching: find final segments that overlap the batch range
    batch_range = range(
        batch.first_segment_index,
        batch.first_segment_index + len(batch.segments),
    )
    matched = [s for s in all_segments if s.segment_index in batch_range]

    assert len(matched) == 3
    assert [s.segment_index for s in matched] == [5, 6, 7]
    # Matching via segment_index is identity-stable: works regardless of the
    # segments' positions in the array (no blind index overlay required)
    for batch_seg, matched_seg in zip(batch.segments, matched):
        assert batch_seg.segment_index == matched_seg.segment_index
