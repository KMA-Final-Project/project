"""
MinIO client wrapper for the AI Engine.

Handles downloading input audio and uploading result chunks/final outputs.
"""

import json
from pathlib import Path
from typing import Any

from loguru import logger
from minio import Minio

from src.config import settings


class MinioClient:
    """MinIO operations for the AI Engine pipeline."""

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

    def upload_chunk(self, media_id: str, chunk_index: int, data: list[dict]) -> str:
        """
        Upload a subtitle chunk (progressive output) to the processed bucket.

        Args:
            media_id: MediaItem ID
            chunk_index: 0-indexed chunk number
            data: List of sentence dicts for this chunk

        Returns:
            The S3 key of the uploaded chunk
        """
        object_key = f"subtitles/{media_id}/chunk_{chunk_index:03d}.json"
        json_bytes = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")

        from io import BytesIO
        self.client.put_object(
            self.bucket_processed,
            object_key,
            BytesIO(json_bytes),
            length=len(json_bytes),
            content_type="application/json",
        )
        logger.debug(f"Uploaded chunk: {object_key} ({len(data)} sentences)")
        return object_key

    def upload_final_result(self, media_id: str, data: list[dict]) -> str:
        """
        Upload the complete subtitle result to the processed bucket.

        Args:
            media_id: MediaItem ID
            data: Complete list of sentence dicts

        Returns:
            The S3 key of the final result
        """
        object_key = f"subtitles/{media_id}/final.json"
        json_bytes = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")

        from io import BytesIO
        self.client.put_object(
            self.bucket_processed,
            object_key,
            BytesIO(json_bytes),
            length=len(json_bytes),
            content_type="application/json",
        )
        logger.info(f"Uploaded final result: {object_key} ({len(data)} sentences)")
        return object_key

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

        from io import BytesIO
        self.client.put_object(
            self.bucket_processed,
            object_key,
            BytesIO(json_bytes),
            length=len(json_bytes),
            content_type="application/json",
        )
        return object_key
