"""
test_v2_pipeline.py — Run the V2 async pipeline directly against local audio files.

Default mode keeps external dependencies fake so only the core pipeline runs:
Whisper → NMT → LLM refinement.

Optional live-infra mode switches to the local Redis, PostgreSQL, and MinIO
services from `infra/` so the harness validates the durable artifact contract
against real infrastructure instead of only in-memory doubles.

Usage:
    cd apps/ai-engine
    python -m src.scripts.test_v2_pipeline
    python -m src.scripts.test_v2_pipeline demo_audio_3.mp3 --lang vi
    python -m src.scripts.test_v2_pipeline demo_audio_3.mp3 --lang vi --live-infra
    python -m src.scripts.test_v2_pipeline demo_audio_2.mp3 --lang vi --live-infra
"""

from __future__ import annotations

import argparse
import asyncio
import importlib
import json
import time
import uuid
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Callable
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

import psycopg2
import redis
from loguru import logger

from src.config import settings

# ---------------------------------------------------------------------------
# Paths and contract constants
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
TEST_MEDIA = PROJECT_ROOT / "test-media"
OUTPUT_DIR = PROJECT_ROOT / "outputs" / "test_v2"

REQUIRED_WORD_KEYS = {"word", "start", "end", "confidence", "phoneme"}
REQUIRED_SENTENCE_KEYS = {
    "text",
    "start",
    "end",
    "words",
    "translation",
    "phonetic",
    "detected_lang",
    "segment_index",
}
REQUIRED_METADATA_KEYS = {
    "duration",
    "engine_profile",
    "source_lang",
    "target_lang",
    "model_used",
}
REQUIRED_BATCH_KEYS = {"batch_index", "first_segment_index", "segments"}

CJK_LANGUAGES = {"zh", "ja", "ko", "yue"}


@dataclass(frozen=True)
class RepresentativeMediaExpectation:
    filename: str
    label: str
    category: str
    enforce_chunk_count_equality: bool
    notes: str


REPRESENTATIVE_MEDIA_MATRIX: dict[str, RepresentativeMediaExpectation] = {
    "demo_audio_2.mp3": RepresentativeMediaExpectation(
        filename="demo_audio_2.mp3",
        label="hard CJK music edge",
        category="cjk_edge",
        enforce_chunk_count_equality=False,
        notes=(
            "Treat this as the difficult CJK/music path. Tier 1 chunk sentence "
            "counts may exceed Tier 2/final counts because semantic merge can "
            "collapse fragments before translation. Validate durable identity and "
            "final ordering, not blind 1:1 chunk-to-batch counts."
        ),
    ),
    "demo_audio_3.mp3": RepresentativeMediaExpectation(
        filename="demo_audio_3.mp3",
        label="technical talkshow baseline",
        category="standard_baseline",
        enforce_chunk_count_equality=True,
        notes=(
            "Treat this as the standard-path baseline. Tier 1 chunk totals, Tier 2 "
            "translated totals, and final.json segment totals should stay aligned."
        ),
    ),
    "demo_audio_4.mp3": RepresentativeMediaExpectation(
        filename="demo_audio_4.mp3",
        label="English speech baseline",
        category="standard_baseline",
        enforce_chunk_count_equality=True,
        notes=(
            "Treat this as the English speech baseline. It should follow the direct "
            "non-CJK path with stable 1:1 counts across chunk, batch, and final layers."
        ),
    ),
}


def get_media_expectation(audio_filename: str) -> RepresentativeMediaExpectation:
    return REPRESENTATIVE_MEDIA_MATRIX.get(
        audio_filename,
        RepresentativeMediaExpectation(
            filename=audio_filename,
            label="generic sample",
            category="generic",
            enforce_chunk_count_equality=True,
            notes=(
                "Unknown sample file. Default to standard-path validation and tighten "
                "or relax expectations only after inspecting the actual source-language path."
            ),
        ),
    )


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _chunk_object_key(media_id: str, chunk_index: int) -> str:
    return f"{media_id}/chunks/{chunk_index}.json"


def _translated_batch_object_key(media_id: str, batch_index: int) -> str:
    return f"{media_id}/translated_batches/{batch_index}.json"


def _final_result_object_key(media_id: str) -> str:
    return f"{media_id}/final.json"


def _parse_chunk_index(object_key: str) -> int:
    return int(Path(object_key).stem)


def _parse_batch_index(object_key: str) -> int:
    return int(Path(object_key).stem)


def _clean_database_url(raw: str) -> str:
    parsed = urlparse(raw)
    qs = parse_qs(parsed.query)
    qs.pop("schema", None)
    clean_query = urlencode(qs, doseq=True)
    return urlunparse(parsed._replace(query=clean_query))


def _redact_url(url: str) -> str:
    parsed = urlparse(url)
    if not parsed.scheme or not parsed.netloc:
        return url
    if not parsed.query:
        return url
    return urlunparse(parsed._replace(query="<redacted>"))


def _redact_event_urls(payload: dict[str, Any]) -> dict[str, Any]:
    redacted: dict[str, Any] = {}
    for key, value in payload.items():
        if isinstance(value, str) and key.lower().endswith("url"):
            redacted[key] = _redact_url(value)
        else:
            redacted[key] = value
    return redacted


# ---------------------------------------------------------------------------
# Contract validation helpers
# ---------------------------------------------------------------------------


def _assert_word_contract(word: dict[str, Any]) -> None:
    assert set(word.keys()) == REQUIRED_WORD_KEYS, (
        f"Word contract drift: expected keys {sorted(REQUIRED_WORD_KEYS)}, "
        f"got {sorted(word.keys())}"
    )
    assert isinstance(word["word"], str)
    assert isinstance(word["start"], (int, float))
    assert isinstance(word["end"], (int, float))
    assert isinstance(word["confidence"], (int, float))
    assert word["phoneme"] is None or isinstance(word["phoneme"], str)


def _assert_sentence_contract(sentence: dict[str, Any]) -> None:
    assert set(sentence.keys()) == REQUIRED_SENTENCE_KEYS, (
        f"Sentence contract drift: expected keys {sorted(REQUIRED_SENTENCE_KEYS)}, "
        f"got {sorted(sentence.keys())}"
    )
    assert isinstance(sentence["text"], str)
    assert isinstance(sentence["start"], (int, float))
    assert isinstance(sentence["end"], (int, float))
    assert isinstance(sentence["words"], list)
    assert isinstance(sentence["translation"], str)
    assert isinstance(sentence["phonetic"], str)
    assert isinstance(sentence["detected_lang"], str)
    assert sentence["segment_index"] is None or isinstance(
        sentence["segment_index"], int
    ), f"segment_index must be None or int, got {type(sentence['segment_index'])}"
    for word in sentence["words"]:
        _assert_word_contract(word)


def _assert_chunk_payload(payload: Any, chunk_key: str) -> int:
    assert isinstance(payload, list), f"{chunk_key} must be a flat sentence array"
    for sentence in payload:
        _assert_sentence_contract(sentence)
        assert sentence["segment_index"] is None, (
            f"Tier 1 chunk {chunk_key} must carry segment_index=null, "
            f"got {sentence['segment_index']!r}"
        )
    return len(payload)


def _assert_batch_payload(payload: Any, batch_key: str, batch_index: int) -> list[int]:
    assert isinstance(payload, dict), f"{batch_key} must be an object"
    assert set(payload.keys()) == REQUIRED_BATCH_KEYS, (
        f"{batch_key} batch contract drift: expected keys {sorted(REQUIRED_BATCH_KEYS)}, "
        f"got {sorted(payload.keys())}"
    )
    assert payload["batch_index"] == batch_index, (
        f"{batch_key} batch_index mismatch: expected {batch_index}, "
        f"got {payload['batch_index']}"
    )
    assert isinstance(payload["first_segment_index"], int)
    assert isinstance(payload["segments"], list)
    assert payload[
        "segments"
    ], f"{batch_key} must contain at least one translated segment"

    segment_indices: list[int] = []
    for offset, sentence in enumerate(payload["segments"]):
        _assert_sentence_contract(sentence)
        assert isinstance(
            sentence["segment_index"], int
        ), f"{batch_key} segment at offset {offset} must have non-null segment_index"
        expected_index = payload["first_segment_index"] + offset
        assert sentence["segment_index"] == expected_index, (
            f"{batch_key} segment at offset {offset}: expected segment_index={expected_index}, "
            f"got {sentence['segment_index']}"
        )
        segment_indices.append(sentence["segment_index"])

    assert (
        payload["first_segment_index"] == segment_indices[0]
    ), f"{batch_key} first_segment_index must equal first segment's segment_index"
    return segment_indices


def _assert_final_payload(payload: Any, final_key: str) -> list[int]:
    assert isinstance(payload, dict), f"{final_key} must be an object"
    assert set(payload.keys()) == {
        "metadata",
        "segments",
    }, f"{final_key} must contain metadata and segments only"
    assert set(payload["metadata"].keys()) == REQUIRED_METADATA_KEYS, (
        f"{final_key} metadata contract drift: expected {sorted(REQUIRED_METADATA_KEYS)}, "
        f"got {sorted(payload['metadata'].keys())}"
    )
    assert isinstance(payload["segments"], list)

    final_indices: list[int] = []
    for idx, sentence in enumerate(payload["segments"]):
        _assert_sentence_contract(sentence)
        assert sentence["segment_index"] == idx, (
            f"{final_key} final segment at position {idx}: expected segment_index={idx}, "
            f"got {sentence['segment_index']}"
        )
        final_indices.append(sentence["segment_index"])
    return final_indices


@dataclass
class ArtifactValidationSummary:
    chunk_keys: list[str]
    batch_keys: list[str]
    final_key: str
    chunk_sentence_total: int
    batch_segment_total: int
    final_segment_total: int
    source_lang: str
    target_lang: str
    matrix_category: str
    matrix_label: str


def validate_uploaded_artifacts(
    *,
    media_id: str,
    artifacts: dict[str, Any],
    expectation: RepresentativeMediaExpectation,
    trace: list[dict[str, Any]],
    output_segments_count: int,
) -> ArtifactValidationSummary:
    chunk_keys = sorted(
        [key for key in artifacts if "/chunks/" in key], key=_parse_chunk_index
    )
    batch_keys = sorted(
        [key for key in artifacts if "/translated_batches/" in key],
        key=_parse_batch_index,
    )
    final_key = _final_result_object_key(media_id)

    assert chunk_keys, "No Tier 1 chunk artifacts were uploaded"
    assert batch_keys, "No Tier 2 translated batch artifacts were uploaded"
    assert final_key in artifacts, f"Missing final artifact: {final_key}"

    chunk_sentence_total = sum(
        _assert_chunk_payload(artifacts[key], key) for key in chunk_keys
    )

    batch_indices_from_payload: list[int] = []
    for key in batch_keys:
        batch_indices_from_payload.extend(
            _assert_batch_payload(artifacts[key], key, _parse_batch_index(key))
        )

    final_indices = _assert_final_payload(artifacts[final_key], final_key)
    final_segment_total = len(final_indices)
    batch_segment_total = len(batch_indices_from_payload)

    assert (
        batch_segment_total == final_segment_total
    ), "Tier 2 translated segment total must match final.json segment total"
    assert (
        final_segment_total == output_segments_count
    ), "Serialized final.json segment count must match the in-process SubtitleOutput"
    assert (
        sorted(batch_indices_from_payload) == final_indices
    ), "Tier 2 segment_index coverage must match final.json ordering"

    if expectation.enforce_chunk_count_equality:
        assert chunk_sentence_total == batch_segment_total == final_segment_total, (
            f"{expectation.filename} is a standard baseline: expected equal counts across "
            "Tier 1, Tier 2, and final artifacts"
        )
    else:
        assert chunk_sentence_total >= batch_segment_total, (
            f"{expectation.filename} is the CJK edge path: expected Tier 1 sentence total "
            "to be greater than or equal to translated/final totals"
        )
        if chunk_sentence_total == batch_segment_total:
            logger.warning(
                "CJK edge sample did not compress Tier 1→Tier 2 counts on this run. "
                "That is allowed, but do not treat it as the generic baseline."
            )

    first_batch = next(
        (item for item in trace if item["event"] == "batch_uploaded"), None
    )
    pipeline_done = next(
        (item for item in trace if item["event"] == "pipeline_completed"), None
    )
    assert first_batch is not None, "Trace missing batch_uploaded event"
    assert pipeline_done is not None, "Trace missing pipeline_completed event"
    assert (
        first_batch["t"] <= pipeline_done["t"]
    ), "First translated batch must be available before pipeline completion"

    final_payload = artifacts[final_key]
    return ArtifactValidationSummary(
        chunk_keys=chunk_keys,
        batch_keys=batch_keys,
        final_key=final_key,
        chunk_sentence_total=chunk_sentence_total,
        batch_segment_total=batch_segment_total,
        final_segment_total=final_segment_total,
        source_lang=final_payload["metadata"].get("source_lang", ""),
        target_lang=final_payload["metadata"].get("target_lang", ""),
        matrix_category=expectation.category,
        matrix_label=expectation.label,
    )


# ---------------------------------------------------------------------------
# Fake-only doubles
# ---------------------------------------------------------------------------


_progress_log: list[dict[str, Any]] = []
_events: list[dict[str, Any]] = []


class FakeMinioClient:
    """In-memory MinIO double that preserves serialized payloads for validation."""

    def __init__(self) -> None:
        self.uploads: list[dict[str, Any]] = []
        self.artifacts: dict[str, Any] = {}

    def upload_chunk(self, media_id: str, chunk_index: int, data: list[dict]):
        object_key = _chunk_object_key(media_id, chunk_index)
        self.artifacts[object_key] = data
        self.uploads.append(
            {
                "type": "chunk",
                "index": chunk_index,
                "count": len(data),
                "object_key": object_key,
            }
        )
        return object_key, f"http://fake/{object_key}"

    def upload_translated_batch(self, media_id: str, batch):
        object_key = _translated_batch_object_key(media_id, batch.batch_index)
        payload = batch.model_dump()
        self.artifacts[object_key] = payload
        self.uploads.append(
            {
                "type": "batch",
                "index": batch.batch_index,
                "count": len(batch.segments),
                "object_key": object_key,
            }
        )
        return object_key, f"http://fake/{object_key}"

    def upload_final_result(self, media_id: str, output):
        object_key = _final_result_object_key(media_id)
        payload = output.model_dump()
        self.artifacts[object_key] = payload
        self.uploads.append(
            {
                "type": "final",
                "count": len(output.segments),
                "object_key": object_key,
            }
        )
        return object_key, f"http://fake/{object_key}"


# ---------------------------------------------------------------------------
# Live-infra tracing helpers
# ---------------------------------------------------------------------------


class TracingMinioClient:
    """Thin wrapper over the real MinioClient that records upload metadata."""

    def __init__(self, inner) -> None:
        self.inner = inner
        self.client = inner.client
        self.bucket_processed = inner.bucket_processed
        self.uploads: list[dict[str, Any]] = []

    def upload_chunk(self, media_id: str, chunk_index: int, data: list[dict]):
        object_key, url = self.inner.upload_chunk(media_id, chunk_index, data)
        self.uploads.append(
            {
                "type": "chunk",
                "index": chunk_index,
                "count": len(data),
                "object_key": object_key,
                "url": url,
            }
        )
        return object_key, url

    def upload_translated_batch(self, media_id: str, batch):
        object_key, url = self.inner.upload_translated_batch(media_id, batch)
        self.uploads.append(
            {
                "type": "batch",
                "index": batch.batch_index,
                "count": len(batch.segments),
                "object_key": object_key,
                "url": url,
            }
        )
        return object_key, url

    def upload_final_result(self, media_id: str, output):
        object_key, url = self.inner.upload_final_result(media_id, output)
        self.uploads.append(
            {
                "type": "final",
                "count": len(output.segments),
                "object_key": object_key,
                "url": url,
            }
        )
        return object_key, url

    def inspect_uploaded_artifacts(self, media_id: str) -> dict[str, Any]:
        prefix = f"{media_id}/"
        artifacts: dict[str, Any] = {}
        objects = sorted(
            self.client.list_objects(
                self.bucket_processed,
                prefix=prefix,
                recursive=True,
            ),
            key=lambda item: item.object_name,
        )
        for obj in objects:
            response = self.client.get_object(self.bucket_processed, obj.object_name)
            try:
                artifacts[obj.object_name] = json.loads(response.read().decode("utf-8"))
            finally:
                response.close()
                response.release_conn()
        return artifacts


class LiveDbFixture:
    def __init__(self, database_url: str) -> None:
        self.dsn = _clean_database_url(database_url)
        self.user_id: str | None = None
        self.media_id: str | None = None

    def _connect(self):
        conn = psycopg2.connect(self.dsn)
        conn.autocommit = True
        return conn

    def preflight(self) -> dict[str, Any]:
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT current_database(), current_user")
                current_database, current_user = cur.fetchone()
                cur.execute("SELECT to_regclass('public.media_items')")
                media_items_table = cur.fetchone()[0]
                cur.execute("SELECT to_regclass('public.users')")
                users_table = cur.fetchone()[0]
        assert media_items_table == "media_items", "media_items table is missing"
        assert users_table == "users", "users table is missing"
        return {
            "database": current_database,
            "db_user": current_user,
            "media_items_table": media_items_table,
            "users_table": users_table,
        }

    def create_scratch_media_row(
        self,
        *,
        user_id: str,
        media_id: str,
        audio_filename: str,
        target_lang: str,
    ) -> None:
        self.user_id = user_id
        self.media_id = media_id
        email = f"{user_id}@local.contract.invalid"
        title = f"Live contract harness: {audio_filename}"
        audio_key = f"local-harness/{audio_filename}"
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO users (id, email, full_name, password_hash, updated_at)
                    VALUES (%s, %s, %s, %s, NOW())
                    """,
                    (user_id, email, "Live Contract Harness", "not-used"),
                )
                cur.execute(
                    """
                    INSERT INTO media_items (
                        id,
                        user_id,
                        title,
                        origin_type,
                        audio_s3_key,
                        duration_seconds,
                        status,
                        progress
                    )
                    VALUES (
                        %s,
                        %s,
                        %s,
                        %s::"MediaOriginType",
                        %s,
                        %s,
                        %s::"MediaStatus",
                        %s
                    )
                    """,
                    (
                        media_id,
                        user_id,
                        title,
                        "LOCAL",
                        audio_key,
                        0,
                        "PROCESSING",
                        0.0,
                    ),
                )
        logger.info(
            f"Created scratch media row for live DB tracing: media_id={media_id} target_lang={target_lang}"
        )

    def snapshot_media_row(self, media_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        id,
                        status::text,
                        progress,
                        current_step,
                        estimated_time_remaining,
                        source_language,
                        transcript_s3_key,
                        fail_reason,
                        counted_in_quota
                    FROM media_items
                    WHERE id = %s
                    """,
                    (media_id,),
                )
                row = cur.fetchone()
        if row is None:
            return None
        return {
            "id": row[0],
            "status": row[1],
            "progress": float(row[2]) if row[2] is not None else None,
            "current_step": row[3],
            "estimated_time_remaining": row[4],
            "source_language": row[5],
            "transcript_s3_key": row[6],
            "fail_reason": row[7],
            "counted_in_quota": bool(row[8]),
        }

    def cleanup(self) -> None:
        if not self.media_id or not self.user_id:
            return
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM media_items WHERE id = %s", (self.media_id,))
                cur.execute("DELETE FROM users WHERE id = %s", (self.user_id,))
        logger.info(
            f"Removed scratch live DB rows for media_id={self.media_id} user_id={self.user_id}"
        )


class RedisEventCapture:
    def __init__(self) -> None:
        self.client = redis.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            password=settings.REDIS_PASSWORD or None,
            decode_responses=True,
        )
        self.pubsub = self.client.pubsub(ignore_subscribe_messages=True)
        self._subscribed = False

    def preflight(self) -> dict[str, Any]:
        pong = self.client.ping()
        return {
            "ping": bool(pong),
            "host": settings.REDIS_HOST,
            "port": settings.REDIS_PORT,
            "channel": "media_updates",
        }

    def start(self) -> None:
        if not self._subscribed:
            self.pubsub.subscribe("media_updates")
            self._subscribed = True

    def drain_media_events(
        self, media_id: str, timeout_seconds: float = 1.0
    ) -> list[dict[str, Any]]:
        events: list[dict[str, Any]] = []
        deadline = time.time() + timeout_seconds
        while time.time() < deadline:
            message = self.pubsub.get_message(timeout=0.1)
            if message is None:
                continue
            if message.get("type") != "message":
                continue
            try:
                payload = json.loads(message["data"])
            except json.JSONDecodeError:
                continue
            if payload.get("mediaId") == media_id:
                events.append(_redact_event_urls(payload))
        return events

    def close(self) -> None:
        try:
            self.pubsub.close()
        finally:
            self.client.close()


# ---------------------------------------------------------------------------
# Runtime preparation
# ---------------------------------------------------------------------------


def _prepare_fake_runtime() -> (
    tuple[Any, Any, Callable[[], FakeMinioClient], Any, Any, list[dict[str, Any]]]
):
    global _progress_log, _events
    _progress_log = []
    _events = []

    db_mod = importlib.import_module("src.db")
    events_mod = importlib.import_module("src.events")

    def _fake_update_media_status(media_id: str, **kwargs):
        progress = kwargs.get("progress")
        step = kwargs.get("current_step")
        snapshot: dict[str, Any] = {
            "media_id": media_id,
            "progress": progress,
            "current_step": step,
            "clear_step": kwargs.get("clear_step", False),
            "status": kwargs.get("status"),
            "source_language": kwargs.get("source_language"),
            "transcript_s3_key": kwargs.get("transcript_s3_key"),
        }
        _progress_log.append(snapshot)
        if progress is not None:
            logger.debug(f"  [DB stub] progress={progress:.2f} step={step}")

    def _fake_publish_progress(media_id, user_id, progress, step, eta):
        _events.append(
            {
                "type": "progress",
                "mediaId": media_id,
                "userId": user_id,
                "progress": progress,
                "currentStep": step,
                "estimatedTimeRemaining": eta,
            }
        )

    def _fake_publish_chunk_ready(
        *, media_id, user_id, chunk_index, url, sentence_count
    ):
        _events.append(
            {
                "type": "chunk_ready",
                "mediaId": media_id,
                "userId": user_id,
                "chunkIndex": chunk_index,
                "url": url,
                "sentenceCount": sentence_count,
            }
        )
        logger.info(
            f"  [Event] chunk_ready #{chunk_index} ({sentence_count} sentences)"
        )

    def _fake_publish_batch_ready(
        *, media_id, user_id, batch_index, url, segment_count, progress
    ):
        _events.append(
            {
                "type": "batch_ready",
                "mediaId": media_id,
                "userId": user_id,
                "batchIndex": batch_index,
                "url": url,
                "segmentCount": segment_count,
                "progress": progress,
            }
        )
        logger.info(
            f"  [Event] batch_ready #{batch_index} ({segment_count} segments, progress={progress:.2f})"
        )

    db_mod.update_media_status = _fake_update_media_status
    events_mod.publish_progress = _fake_publish_progress
    events_mod.publish_chunk_ready = _fake_publish_chunk_ready
    events_mod.publish_batch_ready = _fake_publish_batch_ready

    async_mod = importlib.import_module("src.async_pipeline")
    async_mod = importlib.reload(async_mod)
    pipeline_mod = importlib.import_module("src.core.pipeline")

    return (
        async_mod,
        pipeline_mod,
        FakeMinioClient,
        db_mod,
        events_mod,
        _progress_log,
    )


def _prepare_live_runtime(
    db_fixture: LiveDbFixture,
) -> tuple[
    Any,
    Any,
    Callable[[], TracingMinioClient],
    Any,
    Any,
    list[dict[str, Any]],
    list[dict[str, Any]],
    list[TracingMinioClient],
]:
    db_traces: list[dict[str, Any]] = []
    persistence_checks: list[dict[str, Any]] = []
    minio_client_holder: list[TracingMinioClient] = []

    db_mod = importlib.import_module("src.db")
    events_mod = importlib.import_module("src.events")
    minio_mod = importlib.import_module("src.minio_client")

    real_update_media_status = db_mod.update_media_status
    real_publish_chunk_ready = events_mod.publish_chunk_ready
    real_publish_batch_ready = events_mod.publish_batch_ready
    real_publish_completed = events_mod.publish_completed

    def _traced_update_media_status(media_id: str, **kwargs):
        real_update_media_status(media_id, **kwargs)
        db_traces.append(
            {
                "call": {
                    key: value
                    for key, value in kwargs.items()
                    if key not in {"user_id"}
                },
                "snapshot": db_fixture.snapshot_media_row(media_id),
            }
        )

    def _require_live_minio_client() -> TracingMinioClient:
        if not minio_client_holder:
            raise RuntimeError(
                "Live harness publish interceptor fired before TracingMinioClient was initialized"
            )
        return minio_client_holder[0]

    def _uploaded_object_key(upload_type: str, index: int) -> str:
        minio_client = _require_live_minio_client()
        for upload in reversed(minio_client.uploads):
            if upload["type"] == upload_type and upload.get("index") == index:
                return str(upload["object_key"])
        raise RuntimeError(
            f"Missing traced {upload_type} upload for index={index} before publish"
        )

    def _verify_persistence_before_event(*, event_type: str, object_key: str) -> None:
        minio_client = _require_live_minio_client()
        try:
            minio_client.client.stat_object(minio_client.bucket_processed, object_key)
        except Exception as exc:
            raise RuntimeError(
                f"[EventDiscipline] missing {object_key} before {event_type}"
            ) from exc
        logger.info(
            f"[EventDiscipline] verified {object_key} exists before {event_type}"
        )
        persistence_checks.append(
            {
                "event_type": event_type,
                "object_key": object_key,
                "verified": True,
            }
        )

    def _intercept_publish_chunk_ready(
        *, media_id, user_id, chunk_index, url, sentence_count
    ) -> None:
        object_key = _uploaded_object_key("chunk", chunk_index)
        _verify_persistence_before_event(
            event_type="chunk_ready",
            object_key=object_key,
        )
        real_publish_chunk_ready(
            media_id=media_id,
            user_id=user_id,
            chunk_index=chunk_index,
            url=url,
            sentence_count=sentence_count,
        )

    def _intercept_publish_batch_ready(
        *, media_id, user_id, batch_index, url, segment_count, progress
    ) -> None:
        object_key = _uploaded_object_key("batch", batch_index)
        _verify_persistence_before_event(
            event_type="batch_ready",
            object_key=object_key,
        )
        real_publish_batch_ready(
            media_id=media_id,
            user_id=user_id,
            batch_index=batch_index,
            url=url,
            segment_count=segment_count,
            progress=progress,
        )

    def _intercept_publish_completed(
        *,
        media_id,
        user_id,
        final_url,
        segment_count,
        source_lang,
        target_lang,
        s3_key,
    ) -> None:
        _verify_persistence_before_event(
            event_type="completed",
            object_key=s3_key,
        )
        real_publish_completed(
            media_id=media_id,
            user_id=user_id,
            final_url=final_url,
            segment_count=segment_count,
            source_lang=source_lang,
            target_lang=target_lang,
            s3_key=s3_key,
        )

    db_mod.update_media_status = _traced_update_media_status
    events_mod.publish_chunk_ready = _intercept_publish_chunk_ready
    events_mod.publish_batch_ready = _intercept_publish_batch_ready
    events_mod.publish_completed = _intercept_publish_completed

    async_mod = importlib.import_module("src.async_pipeline")
    async_mod = importlib.reload(async_mod)
    async_mod.publish_chunk_ready = _intercept_publish_chunk_ready
    async_mod.publish_batch_ready = _intercept_publish_batch_ready

    main_mod = importlib.import_module("src.main")
    main_mod.publish_completed = _intercept_publish_completed

    pipeline_mod = importlib.import_module("src.core.pipeline")

    def _factory() -> TracingMinioClient:
        return TracingMinioClient(minio_mod.MinioClient())

    return (
        async_mod,
        pipeline_mod,
        _factory,
        db_mod,
        events_mod,
        db_traces,
        persistence_checks,
        minio_client_holder,
    )


# ---------------------------------------------------------------------------
# Harness execution
# ---------------------------------------------------------------------------


async def run_test(audio_filename: str, target_lang: str, *, live_infra: bool) -> None:
    audio_path = TEST_MEDIA / audio_filename
    if not audio_path.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    expectation = get_media_expectation(audio_filename)
    media_id_prefix = "live" if live_infra else "test"
    media_id = f"{media_id_prefix}-{audio_path.stem}-{uuid.uuid4().hex[:8]}"
    user_id = f"harness-user-{uuid.uuid4().hex[:8]}"

    logger.info(f"{'=' * 68}")
    logger.info("V2 Pipeline Contract Harness")
    logger.info(f"  Audio:         {audio_path.name}")
    logger.info(f"  Target lang:   {target_lang}")
    logger.info(f"  Media ID:      {media_id}")
    logger.info(f"  Mode:          {'live-infra' if live_infra else 'fake-only'}")
    logger.info(f"  Matrix label:  {expectation.label}")
    logger.info(f"  Matrix notes:  {expectation.notes}")
    logger.info(f"{'=' * 68}")

    db_fixture: LiveDbFixture | None = None
    redis_capture: RedisEventCapture | None = None
    redis_events: list[dict[str, Any]] = []
    preflight: dict[str, Any] = {}
    db_traces: list[dict[str, Any]] = []
    persistence_checks: list[dict[str, Any]] = []
    minio_client_holder: list[TracingMinioClient] = []
    db_final_snapshot: dict[str, Any] | None = None
    output = None
    final_url = ""

    try:
        if live_infra:
            if not settings.DATABASE_URL:
                raise RuntimeError("DATABASE_URL is required for --live-infra mode")
            db_fixture = LiveDbFixture(settings.DATABASE_URL)
            preflight["postgres"] = db_fixture.preflight()
            redis_capture = RedisEventCapture()
            preflight["redis"] = redis_capture.preflight()
            redis_capture.start()
            preflight["minio"] = {
                "endpoint": settings.MINIO_ENDPOINT,
                "port": settings.MINIO_PORT,
                "bucket_processed": settings.MINIO_BUCKET_PROCESSED,
                "bucket_raw": settings.MINIO_BUCKET_RAW,
                "use_ssl": settings.MINIO_USE_SSL,
            }
            logger.info(
                f"Live infra preflight: Redis {settings.REDIS_HOST}:{settings.REDIS_PORT}, "
                f"MinIO {settings.MINIO_ENDPOINT}:{settings.MINIO_PORT}, "
                f"Postgres {preflight['postgres']['database']}"
            )
            db_fixture.create_scratch_media_row(
                user_id=user_id,
                media_id=media_id,
                audio_filename=audio_filename,
                target_lang=target_lang,
            )
            (
                async_mod,
                pipeline_mod,
                minio_factory,
                db_mod,
                events_mod,
                db_traces,
                persistence_checks,
                minio_client_holder,
            ) = _prepare_live_runtime(db_fixture)
        else:
            async_mod, pipeline_mod, minio_factory, db_mod, events_mod, db_traces = (
                _prepare_fake_runtime()
            )

        trace: list[dict[str, Any]] = []
        pipeline = pipeline_mod.PipelineOrchestrator()
        minio_client = minio_factory()
        if live_infra:
            minio_client_holder.append(minio_client)

        logger.info("Loading models (this may take a moment on first run)...")
        t0 = time.time()
        try:
            output = await async_mod.run_v2_pipeline_async(
                pipeline,
                minio_client,
                audio_path,
                media_id,
                user_id=user_id,
                started_at=t0,
                target_lang=target_lang,
                debug_trace=trace,
            )
            final_key, final_url = minio_client.upload_final_result(media_id, output)

            if live_infra:
                db_mod.update_media_status(
                    media_id,
                    user_id=user_id,
                    status="COMPLETED",
                    progress=1.0,
                    transcript_s3_key=final_key,
                    clear_step=True,
                )
                events_mod.publish_completed(
                    media_id=media_id,
                    user_id=user_id,
                    final_url=final_url,
                    segment_count=len(output.segments),
                    source_lang=output.metadata.source_lang or "",
                    target_lang=output.metadata.target_lang or "",
                    s3_key=final_key,
                )
                db_mod.mark_quota_counted(media_id)
                await asyncio.sleep(0.35)
                assert redis_capture is not None
                redis_events = redis_capture.drain_media_events(media_id)
                assert db_fixture is not None
                db_final_snapshot = db_fixture.snapshot_media_row(media_id)
            elapsed = time.time() - t0
        except Exception:
            logger.exception("Pipeline failed!")
            raise

        if live_infra:
            artifacts = minio_client.inspect_uploaded_artifacts(media_id)
        else:
            artifacts = minio_client.artifacts

        validation = validate_uploaded_artifacts(
            media_id=media_id,
            artifacts=artifacts,
            expectation=expectation,
            trace=trace,
            output_segments_count=len(output.segments),
        )

        logger.info(f"\n{'=' * 68}")
        logger.success(f"Pipeline completed in {elapsed:.1f}s")
        logger.info(f"  Source lang:   {validation.source_lang}")
        logger.info(f"  Target lang:   {validation.target_lang}")
        logger.info(f"  Segments:      {validation.final_segment_total}")
        logger.info(f"  Tier 1 keys:   {len(validation.chunk_keys)}")
        logger.info(f"  Tier 2 keys:   {len(validation.batch_keys)}")
        logger.info(f"  Final key:     {validation.final_key}")
        logger.info(
            f"  Count matrix:  Tier1={validation.chunk_sentence_total} | "
            f"Tier2={validation.batch_segment_total} | final={validation.final_segment_total}"
        )
        logger.info(f"  Final URL:     {_redact_url(final_url)}")

        first_batch = next(
            (item for item in trace if item["event"] == "batch_uploaded"), None
        )
        pipeline_done = next(
            (item for item in trace if item["event"] == "pipeline_completed"), None
        )
        if first_batch:
            logger.info(
                f"  First translated batch at: {first_batch['t']:.3f}s "
                f"(batch #{first_batch['batch_index']})"
            )
        if pipeline_done:
            logger.info(f"  Pipeline completed at:    {pipeline_done['t']:.3f}s")
        if first_batch and pipeline_done:
            logger.info(
                f"  First-batch lead time:     {pipeline_done['t'] - first_batch['t']:.3f}s"
            )

        if trace:
            logger.info(f"\n{'─' * 68}")
            logger.info("Timing checkpoints:")
            logger.info(f"{'─' * 68}")
            for entry in trace:
                extras = {k: v for k, v in entry.items() if k not in {"event", "t"}}
                logger.info(f"  {entry['t']:>7.3f}s  {entry['event']}  {extras}")

        if redis_events:
            logger.info(f"\n{'─' * 68}")
            logger.info("Captured Redis media_updates events:")
            logger.info(f"{'─' * 68}")
            for event in redis_events:
                logger.info(f"  {event}")

        if db_traces:
            logger.info(f"\n{'─' * 68}")
            logger.info("DB status snapshots:")
            logger.info(f"{'─' * 68}")
            for item in db_traces:
                logger.info(f"  call={item['call']} snapshot={item['snapshot']}")

        if db_final_snapshot is not None:
            logger.info(f"  Final DB row snapshot: {db_final_snapshot}")

        if output.segments:
            logger.info(f"\n{'─' * 68}")
            logger.info("Sample bilingual segments (first 10):")
            logger.info(f"{'─' * 68}")
            for seg in output.segments[:10]:
                logger.info(
                    f"  [{seg.start:.1f}s - {seg.end:.1f}s]\n"
                    f"    SRC: {seg.text}\n"
                    f"    TGT: {seg.translation}"
                )

        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        output_file = OUTPUT_DIR / f"{audio_path.stem}_{target_lang}_{media_id}.json"
        output_file.write_text(
            json.dumps(output.model_dump(), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        harness_report = {
            "audio_file": audio_path.name,
            "target_lang": target_lang,
            "media_id": media_id,
            "mode": "live-infra" if live_infra else "fake-only",
            "representative_media_expectation": asdict(expectation),
            "preflight": preflight,
            "validation": asdict(validation),
            "trace": trace,
            "redis_events": redis_events,
            "db_traces": db_traces,
            "db_final_snapshot": db_final_snapshot,
            "artifact_keys": sorted(artifacts.keys()),
            "persistence_before_event_checks": persistence_checks,
            "local_output_file": str(output_file),
        }
        report_file = (
            OUTPUT_DIR / f"{audio_path.stem}_{target_lang}_{media_id}.harness.json"
        )
        report_file.write_text(
            json.dumps(harness_report, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        logger.success(f"Full output saved to: {output_file}")
        logger.success(f"Harness report saved to: {report_file}")
    finally:
        if redis_capture is not None:
            redis_capture.close()
        if db_fixture is not None:
            db_fixture.cleanup()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run the V2 async pipeline against a local test-media file"
    )
    parser.add_argument(
        "audio_file",
        nargs="?",
        default="demo_audio_2.mp3",
        help="Filename inside apps/ai-engine/test-media",
    )
    parser.add_argument(
        "--lang",
        default="vi",
        dest="target_lang",
        help="Target language code",
    )
    parser.add_argument(
        "--live-infra",
        action="store_true",
        help="Use local Redis/Postgres/MinIO instead of in-memory fakes",
    )
    args = parser.parse_args()

    asyncio.run(
        run_test(
            args.audio_file,
            args.target_lang,
            live_infra=args.live_infra,
        )
    )


if __name__ == "__main__":
    main()
