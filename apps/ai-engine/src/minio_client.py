"""
MinIO client wrapper for the AI Engine.

Handles downloading input audio and uploading result chunks/final outputs.
"""

import json
from datetime import timedelta
from io import BytesIO
from pathlib import Path
from typing import Any

from loguru import logger
from minio import Minio

from src.config import settings
from src.schemas import SubtitleOutput, TranslatedBatch


class MinioClient:
    """MinIO operations for the AI Engine pipeline."""

    @staticmethod
    def chunk_object_key(media_id: str, chunk_index: int) -> str:
        """Return the canonical Tier 1 artifact key for a chunk upload."""
        return f"{media_id}/chunks/{chunk_index}.json"

    @staticmethod
    def translated_batch_object_key(media_id: str, batch_index: int) -> str:
        """Return the canonical Tier 2 artifact key for a translated batch upload."""
        return f"{media_id}/translated_batches/{batch_index}.json"

    @staticmethod
    def final_result_object_key(media_id: str) -> str:
        """Return the canonical final artifact key for a completed subtitle output."""
        return f"{media_id}/final.json"

    def __init__(self):
        self.client = Minio(
            endpoint=f"{settings.MINIO_ENDPOINT}:{settings.MINIO_PORT}",
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_USE_SSL,
        )
        self.bucket_raw = settings.MINIO_BUCKET_RAW
        self.bucket_processed = settings.MINIO_BUCKET_PROCESSED
        self._ensure_buckets()

    def _ensure_buckets(self):
        """Create buckets if they don't exist."""
        for bucket in [self.bucket_raw, self.bucket_processed]:
            if not self.client.bucket_exists(bucket):
                self.client.make_bucket(bucket)
                logger.info(f"Created MinIO bucket: {bucket}")

    def get_presigned_url(self, object_key: str, expires: int = 3600) -> str:
        """
        Generate a presigned GET URL for an object in the processed bucket.

        Args:
            object_key: S3 key in the processed bucket
            expires: URL validity in seconds (default: 1 hour)

        Returns:
            Public-facing presigned GET URL
        """
        url = self.client.presigned_get_object(
            self.bucket_processed,
            object_key,
            expires=timedelta(seconds=expires),
        )
        # Rewrite internal Docker endpoint → public-facing domain
        if settings.MINIO_PUBLIC_ENDPOINT:
            protocol = "https" if settings.MINIO_USE_SSL else "http"
            internal_origin = (
                f"{protocol}://{settings.MINIO_ENDPOINT}:{settings.MINIO_PORT}"
            )
            url = url.replace(internal_origin, settings.MINIO_PUBLIC_ENDPOINT)
        return url

    def download_audio(self, object_key: str, local_path: Path) -> Path:
        """
        Download an audio file from the raw bucket to a local path.

        Args:
            object_key: S3 key in the raw bucket
            local_path: Local filesystem path to save to

        Returns:
            The local_path for convenience
        """
        local_path.parent.mkdir(parents=True, exist_ok=True)
        self.client.fget_object(self.bucket_raw, object_key, str(local_path))
        logger.info(f"Downloaded audio: {object_key} → {local_path}")
        return local_path

    def upload_chunk(
        self, media_id: str, chunk_index: int, data: list[dict]
    ) -> tuple[str, str]:
        """
        Upload a subtitle chunk (Tier 1 progressive output) to the processed bucket.

        Args:
            media_id: MediaItem ID
            chunk_index: 0-indexed chunk number
            data: List of sentence dicts for this chunk

        Returns:
            Tuple of (s3_key, presigned_get_url)
        """
        object_key = self.chunk_object_key(media_id, chunk_index)
        json_bytes = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")

        self.client.put_object(
            self.bucket_processed,
            object_key,
            BytesIO(json_bytes),
            length=len(json_bytes),
            content_type="application/json",
        )
        logger.debug(f"Uploaded chunk: {object_key} ({len(data)} sentences)")
        return object_key, self.get_presigned_url(object_key)

    def upload_final_result(
        self, media_id: str, output: SubtitleOutput
    ) -> tuple[str, str]:
        """
        Upload the complete SubtitleOutput to the processed bucket as final.json.

        Args:
            media_id: MediaItem ID
            output: Complete SubtitleOutput with metadata + segments

        Returns:
            Tuple of (s3_key, presigned_get_url)
        """
        object_key = self.final_result_object_key(media_id)
        data = output.model_dump()
        json_bytes = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")

        self.client.put_object(
            self.bucket_processed,
            object_key,
            BytesIO(json_bytes),
            length=len(json_bytes),
            content_type="application/json",
        )
        logger.info(
            f"Uploaded final result: {object_key} ({len(output.segments)} segments)"
        )
        return object_key, self.get_presigned_url(object_key)

    def upload_translated_batch(
        self, media_id: str, batch: TranslatedBatch
    ) -> tuple[str, str]:
        """
        Upload a translated batch (Tier 2 streaming) to the processed bucket.

        Args:
            media_id: MediaItem ID
            batch: TranslatedBatch with batch_index and segments

        Returns:
            Tuple of (s3_key, presigned_get_url)
        """
        object_key = self.translated_batch_object_key(media_id, batch.batch_index)
        data = batch.model_dump()
        json_bytes = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")

        self.client.put_object(
            self.bucket_processed,
            object_key,
            BytesIO(json_bytes),
            length=len(json_bytes),
            content_type="application/json",
        )
        logger.debug(
            f"Uploaded translated batch: {object_key} ({len(batch.segments)} segments)"
        )
        return object_key, self.get_presigned_url(object_key)

    def upload_json(self, object_key: str, data: Any) -> str:
        """
        Upload arbitrary JSON data to the processed bucket.

        Args:
            object_key: Full S3 key
            data: JSON-serializable data

        Returns:
            The S3 key
        """
        json_bytes = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")

        self.client.put_object(
            self.bucket_processed,
            object_key,
            BytesIO(json_bytes),
            length=len(json_bytes),
            content_type="application/json",
        )
        return object_key
