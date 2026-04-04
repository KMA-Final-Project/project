from __future__ import annotations

from datetime import timedelta

import src.minio_client as minio_mod


class RecordingMinio:
    instances: list["RecordingMinio"] = []

    def __init__(
        self,
        endpoint: str,
        access_key: str,
        secret_key: str,
        secure: bool,
    ) -> None:
        self.endpoint = endpoint
        self.access_key = access_key
        self.secret_key = secret_key
        self.secure = secure
        self.presigned_get_calls: list[tuple[str, str, timedelta]] = []
        RecordingMinio.instances.append(self)

    def bucket_exists(self, bucket: str) -> bool:
        return True

    def make_bucket(self, bucket: str) -> None:
        raise AssertionError("make_bucket should not be called in this test")

    def presigned_get_object(
        self, bucket: str, object_key: str, expires: timedelta
    ) -> str:
        self.presigned_get_calls.append((bucket, object_key, expires))
        protocol = "https" if self.secure else "http"
        return f"{protocol}://{self.endpoint}/{bucket}/{object_key}?sig=ok"


def test_presigned_get_uses_public_client_when_public_endpoint_is_configured(
    monkeypatch,
) -> None:
    RecordingMinio.instances.clear()
    monkeypatch.setattr(minio_mod, "Minio", RecordingMinio)
    monkeypatch.setattr(minio_mod.settings, "MINIO_ENDPOINT", "localhost")
    monkeypatch.setattr(minio_mod.settings, "MINIO_PORT", 9000)
    monkeypatch.setattr(minio_mod.settings, "MINIO_ACCESS_KEY", "access-key")
    monkeypatch.setattr(minio_mod.settings, "MINIO_SECRET_KEY", "secret-key")
    monkeypatch.setattr(minio_mod.settings, "MINIO_USE_SSL", False)
    monkeypatch.setattr(minio_mod.settings, "MINIO_BUCKET_RAW", "raw")
    monkeypatch.setattr(minio_mod.settings, "MINIO_BUCKET_PROCESSED", "processed")
    monkeypatch.setattr(
        minio_mod.settings,
        "MINIO_PUBLIC_ENDPOINT",
        "https://bilingual-minio.sondndev.id.vn",
    )

    client = minio_mod.MinioClient()
    url = client.get_presigned_url("media-123/translated_batches/0.json", expires=1800)

    assert len(RecordingMinio.instances) == 2
    internal_client, public_client = RecordingMinio.instances

    assert internal_client.endpoint == "localhost:9000"
    assert internal_client.secure is False
    assert public_client.endpoint == "bilingual-minio.sondndev.id.vn:443"
    assert public_client.secure is True
    assert public_client.presigned_get_calls == [
        (
            "processed",
            "media-123/translated_batches/0.json",
            timedelta(seconds=1800),
        )
    ]
    assert url.startswith(
        "https://bilingual-minio.sondndev.id.vn:443/processed/media-123/translated_batches/0.json"
    )