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
}
REQUIRED_METADATA_KEYS = {
    "duration",
    "engine_profile",
    "source_lang",
    "target_lang",
    "model_used",
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
    chunk = [_make_sentence(0).model_dump(), _make_sentence(1).model_dump()]

    key, url = minio_double.upload_chunk("media-123", 4, chunk)
    payload = _last_put_json(minio_double)

    assert key == MinioClient.chunk_object_key("media-123", 4)
    assert url.startswith(f"http://fake/{key}")
    assert isinstance(payload, list)
    assert len(payload) == 2
    for sentence in payload:
        _assert_sentence_contract(sentence)


def test_translated_batch_artifact_wraps_segments_with_batch_metadata(
    minio_double: MinioClient,
) -> None:
    batch = TranslatedBatch(
        batch_index=2,
        segments=[
            _make_sentence(
                0,
                translation="Xin chào",
                phonetic="xin chao",
                detected_lang="zh",
                word_phoneme="ni hao",
            )
        ],
    )

    key, url = minio_double.upload_translated_batch("media-123", batch)
    payload = _last_put_json(minio_double)

    assert key == MinioClient.translated_batch_object_key("media-123", 2)
    assert url.startswith(f"http://fake/{key}")
    assert set(payload.keys()) == {"batch_index", "segments"}
    assert payload["batch_index"] == 2
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
