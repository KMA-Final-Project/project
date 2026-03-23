"""
Database helpers — direct PostgreSQL updates for the AI Engine.

We use psycopg2 (not via NestJS) because:
1. The AI Engine runs as a separate Python process
2. Progress updates need low latency (no HTTP round-trip)
3. psycopg2 is lightweight and reliable
"""

from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

import psycopg2
import psycopg2.pool
from loguru import logger

from src.config import settings


def _get_psycopg2_dsn() -> str:
    """
    Strip Prisma-specific query parameters (like ?schema=public) from
    DATABASE_URL, since psycopg2 doesn't understand them.
    """
    raw = settings.DATABASE_URL
    parsed = urlparse(raw)
    qs = parse_qs(parsed.query)
    qs.pop("schema", None)
    clean_query = urlencode(qs, doseq=True)
    clean_url = urlunparse(parsed._replace(query=clean_query))
    return clean_url


# Lazy-initialized connection pool (created on first DB call)
_db_pool: psycopg2.pool.SimpleConnectionPool | None = None


def _get_db_pool() -> psycopg2.pool.SimpleConnectionPool:
    """Return a shared connection pool, creating it on first use."""
    global _db_pool
    if _db_pool is None or _db_pool.closed:
        _db_pool = psycopg2.pool.SimpleConnectionPool(
            minconn=1, maxconn=4, dsn=_get_psycopg2_dsn()
        )
    return _db_pool


def update_media_status(
    media_id: str,
    *,
    user_id: str | None = None,
    status: str | None = None,
    progress: float | None = None,
    current_step: str | None = None,
    estimated_time_remaining: int | None = None,
    source_language: str | None = None,
    transcript_s3_key: str | None = None,
    subtitle_s3_key: str | None = None,
    fail_reason: str | None = None,
    clear_step: bool = False,
) -> None:
    """
    Update MediaItem directly in PostgreSQL.

    Pass clear_step=True to set current_step and estimated_time_remaining to NULL
    (used when the job finishes or fails).
    """
    if not settings.DATABASE_URL:
        logger.warning("DATABASE_URL not set — skipping DB update")
        return

    set_clauses: list[str] = []
    values: list = []

    if status is not None:
        set_clauses.append('status = %s::"MediaStatus"')
        values.append(status)
    if progress is not None:
        set_clauses.append("progress = GREATEST(COALESCE(progress, 0), %s)")
        values.append(progress)
    if current_step is not None:
        set_clauses.append("current_step = %s")
        values.append(current_step)
    if clear_step:
        set_clauses.append("current_step = NULL")
        set_clauses.append("estimated_time_remaining = NULL")
    elif estimated_time_remaining is not None:
        set_clauses.append("estimated_time_remaining = %s")
        values.append(estimated_time_remaining)
    if source_language is not None:
        set_clauses.append("source_language = %s")
        values.append(source_language)
    if transcript_s3_key is not None:
        set_clauses.append("transcript_s3_key = %s")
        values.append(transcript_s3_key)
    if subtitle_s3_key is not None:
        set_clauses.append("subtitle_s3_key = %s")
        values.append(subtitle_s3_key)
    if fail_reason is not None:
        set_clauses.append("fail_reason = %s")
        values.append(fail_reason)

    if not set_clauses:
        return

    values.append(media_id)
    sql = f"UPDATE media_items SET {', '.join(set_clauses)} WHERE id = %s"

    try:
        pool = _get_db_pool()
        conn = pool.getconn()
        try:
            with conn:
                with conn.cursor() as cur:
                    cur.execute(sql, values)
        finally:
            pool.putconn(conn)

    except Exception as e:
        logger.error(f"DB update failed for media {media_id}: {e}")


def mark_quota_counted(media_id: str) -> None:
    """Mark the MediaItem as counted in the user's quota."""
    if not settings.DATABASE_URL:
        return

    try:
        pool = _get_db_pool()
        conn = pool.getconn()
        try:
            with conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE media_items SET counted_in_quota = true WHERE id = %s",
                        (media_id,),
                    )
        finally:
            pool.putconn(conn)
    except Exception as e:
        logger.error(f"Failed to mark quota for media {media_id}: {e}")
