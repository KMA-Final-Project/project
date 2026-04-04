"""
Redis event publishers — typed helpers for Pub/Sub media events.

Every function publishes a JSON payload on the ``media_updates`` channel.
The NestJS backend subscribes to these events and forwards them to
the mobile client via Socket.IO.
"""

import json

import redis
from loguru import logger

from src.config import settings

redis_client = redis.Redis(
    host=settings.REDIS_HOST,
    port=settings.REDIS_PORT,
    password=settings.REDIS_PASSWORD or None,
    decode_responses=True,
)


def publish_progress(
    media_id: str,
    user_id: str,
    progress: float,
    current_step: str,
    eta: int | None,
    source_lang: str | None = None,
) -> None:
    """Publish a MediaProgressEvent to the media_updates channel."""
    try:
        payload = {
            "type": "progress",
            "mediaId": media_id,
            "userId": user_id,
            "progress": progress,
            "currentStep": current_step,
            "estimatedTimeRemaining": eta,
        }
        if source_lang:
            payload["sourceLanguage"] = source_lang

        redis_client.publish(
            "media_updates",
            json.dumps(payload),
        )
    except Exception as e:
        logger.error(f"Failed to publish progress event for {media_id}: {e}")


def publish_chunk_ready(
    media_id: str,
    user_id: str,
    chunk_index: int,
    url: str,
    sentence_count: int,
) -> None:
    """Publish a MediaChunkReadyEvent to the media_updates channel."""
    try:
        redis_client.publish(
            "media_updates",
            json.dumps(
                {
                    "type": "chunk_ready",
                    "mediaId": media_id,
                    "userId": user_id,
                    "chunkIndex": chunk_index,
                    "url": url,
                    "sentenceCount": sentence_count,
                }
            ),
        )
    except Exception as e:
        logger.error(f"Failed to publish chunk_ready event for {media_id}: {e}")


def publish_batch_ready(
    media_id: str,
    user_id: str,
    batch_index: int,
    url: str,
    segment_count: int,
    progress: float,
) -> None:
    """Publish a MediaBatchReadyEvent to the media_updates channel."""
    try:
        redis_client.publish(
            "media_updates",
            json.dumps(
                {
                    "type": "batch_ready",
                    "mediaId": media_id,
                    "userId": user_id,
                    "batchIndex": batch_index,
                    "url": url,
                    "segmentCount": segment_count,
                    "progress": progress,
                }
            ),
        )
    except Exception as e:
        logger.error(f"Failed to publish batch_ready event for {media_id}: {e}")


def publish_completed(
    media_id: str,
    user_id: str,
    final_url: str,
    segment_count: int,
    source_lang: str,
    target_lang: str,
    s3_key: str,
) -> None:
    """Publish a MediaCompletedEvent to the media_updates channel."""
    try:
        redis_client.publish(
            "media_updates",
            json.dumps(
                {
                    "type": "completed",
                    "mediaId": media_id,
                    "userId": user_id,
                    "finalUrl": final_url,
                    "segmentCount": segment_count,
                    "sourceLanguage": source_lang,
                    "targetLanguage": target_lang,
                    "transcriptS3Key": s3_key,
                }
            ),
        )
    except Exception as e:
        logger.error(f"Failed to publish completed event for {media_id}: {e}")


def publish_failed(media_id: str, user_id: str, reason: str) -> None:
    """Publish a MediaFailedEvent to the media_updates channel."""
    try:
        redis_client.publish(
            "media_updates",
            json.dumps(
                {
                    "type": "failed",
                    "mediaId": media_id,
                    "userId": user_id,
                    "reason": reason,
                }
            ),
        )
    except Exception as e:
        logger.error(f"Failed to publish failed event for {media_id}: {e}")
