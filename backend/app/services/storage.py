"""Cloudflare R2 storage service (S3-compatible).

Falls back to local filesystem when R2 env vars are not set,
so docker-compose local dev works without changes.
"""
import os
import tempfile
from pathlib import Path

_endpoint = os.environ.get("R2_ENDPOINT_URL", "")
_bucket = os.environ.get("R2_BUCKET_NAME", "")
_public_url = os.environ.get("R2_PUBLIC_URL", "").rstrip("/")
_configured = bool(
    _endpoint
    and _bucket
    and _public_url
    and os.environ.get("R2_ACCESS_KEY_ID")
    and os.environ.get("R2_SECRET_ACCESS_KEY")
)


def _client():
    import boto3
    return boto3.client(
        "s3",
        endpoint_url=_endpoint,
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def is_remote() -> bool:
    """True when R2 is configured (production). False for local dev."""
    return _configured


def upload(local_path: Path, key: str) -> str:
    """Upload a local file to R2. Returns the R2 key."""
    _client().upload_file(str(local_path), _bucket, key)
    return key


def upload_bytes(data: bytes, key: str, content_type: str = "application/octet-stream") -> str:
    """Upload raw bytes to R2. Returns the R2 key."""
    _client().put_object(Bucket=_bucket, Key=key, Body=data, ContentType=content_type)
    return key


def delete(key: str) -> None:
    """Delete an object from R2."""
    _client().delete_object(Bucket=_bucket, Key=key)


def public_url(key: str) -> str:
    """Return the public HTTP URL for an R2 key."""
    return f"{_public_url}/{key}"


def download_temp(key: str) -> Path:
    """Download an R2 object to a temporary local file.

    The caller is responsible for deleting the file after use.
    """
    suffix = Path(key).suffix
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp.close()
    _client().download_file(_bucket, key, tmp.name)
    return Path(tmp.name)
