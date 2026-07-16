"""SQLiteの整合性あるオンラインバックアップと安全な復元。"""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import os
from pathlib import Path
import shutil
import sqlite3
from typing import Any
import uuid


BACKUP_PREFIX = "dosl-hub-db-"
BACKUP_SUFFIX = ".sqlite3"


class BackupValidationError(RuntimeError):
    """バックアップのチェックサムまたはSQLite整合性が不正。"""


@dataclass(frozen=True)
class BackupArtifact:
    database_path: Path
    checksum_path: Path
    sha256: str


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _integrity_check(path: Path) -> None:
    try:
        uri = f"{path.resolve().as_uri()}?mode=ro"
        with sqlite3.connect(uri, uri=True) as database:
            result = database.execute("PRAGMA integrity_check").fetchone()
    except sqlite3.DatabaseError as exc:
        raise BackupValidationError("SQLiteバックアップを開けません") from exc
    if result != ("ok",):
        raise BackupValidationError(f"SQLite integrity_check failed: {result}")


def verify_sqlite_backup(
    backup_path: str | Path,
    expected_sha256: str | None = None,
) -> bool:
    """チェックサムとPRAGMA integrity_checkの両方を検証する。"""
    path = Path(backup_path)
    if not path.is_file():
        raise BackupValidationError("バックアップファイルが見つかりません")
    actual_sha256 = _sha256(path)
    if expected_sha256 and actual_sha256 != expected_sha256.lower():
        raise BackupValidationError("バックアップのSHA-256が一致しません")
    _integrity_check(path)
    return True


def create_sqlite_backup(
    source_path: str | Path,
    output_dir: str | Path,
    *,
    now: datetime | None = None,
) -> BackupArtifact:
    """稼働中DBをsqlite3 backup APIでスナップショット化する。"""
    source = Path(source_path).resolve()
    output = Path(output_dir).resolve()
    if not source.is_file():
        raise FileNotFoundError(source)
    output.mkdir(parents=True, exist_ok=True)
    if source.parent == output and source.name.startswith(BACKUP_PREFIX):
        raise ValueError("バックアップ元と保存先が不正です")

    timestamp = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    filename = timestamp.strftime(f"{BACKUP_PREFIX}%Y%m%dT%H%M%SZ{BACKUP_SUFFIX}")
    destination = output / filename
    checksum_path = output / f"{filename}.sha256"
    if destination.exists() or checksum_path.exists():
        raise FileExistsError(destination)

    temporary = output / f".{filename}.{uuid.uuid4().hex}.partial"
    try:
        source_uri = f"{source.as_uri()}?mode=ro"
        with sqlite3.connect(source_uri, uri=True) as source_db:
            with sqlite3.connect(temporary) as backup_db:
                source_db.backup(backup_db)
        _integrity_check(temporary)
        sha256 = _sha256(temporary)
        os.rename(temporary, destination)
        checksum_path.write_text(
            f"{sha256}  {destination.name}\n",
            encoding="ascii",
        )
        return BackupArtifact(destination, checksum_path, sha256)
    finally:
        temporary.unlink(missing_ok=True)


def upload_backup_to_gcs(
    artifact: BackupArtifact,
    bucket_name: str,
    *,
    prefix: str = "sqlite/hourly",
    client: Any = None,
) -> list[str]:
    """バックアップとチェックサムを上書き禁止でGCSへ保存する。"""
    if not bucket_name.strip():
        raise ValueError("バックアップ用GCSバケット名が必要です")
    if client is None:
        from google.cloud import storage

        client = storage.Client()

    bucket = client.bucket(bucket_name)
    normalized_prefix = prefix.strip("/")
    uploaded_uris = []
    for path, content_type in (
        (artifact.database_path, "application/vnd.sqlite3"),
        (artifact.checksum_path, "text/plain"),
    ):
        object_name = f"{normalized_prefix}/{path.name}"
        blob = bucket.blob(object_name)
        blob.metadata = {"sha256": artifact.sha256}
        blob.upload_from_filename(
            str(path),
            content_type=content_type,
            if_generation_match=0,
            timeout=120,
        )
        uploaded_uris.append(f"gs://{bucket_name}/{object_name}")
    return uploaded_uris


def prune_local_backups(
    output_dir: str | Path,
    *,
    retention_hours: int = 48,
    now: datetime | None = None,
) -> list[Path]:
    """GCS送信済み後に、管理対象の古いローカル世代だけを削除する。"""
    if retention_hours < 1:
        raise ValueError("retention_hoursは1以上である必要があります")
    output = Path(output_dir).resolve()
    if not output.is_dir():
        return []
    current = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    cutoff = (current - timedelta(hours=retention_hours)).timestamp()
    candidates = list(output.glob(f"{BACKUP_PREFIX}*{BACKUP_SUFFIX}"))
    candidates += list(output.glob(f"{BACKUP_PREFIX}*{BACKUP_SUFFIX}.sha256"))
    removed = []
    for path in sorted(candidates):
        if path.is_file() and path.stat().st_mtime < cutoff:
            path.unlink()
            removed.append(path)
    return removed


def restore_sqlite_backup(
    backup_path: str | Path,
    destination_path: str | Path,
    *,
    expected_sha256: str | None = None,
    replace: bool = False,
) -> Path:
    """検証済みバックアップを復元する。既存DBは明示なしに上書きしない。"""
    backup = Path(backup_path).resolve()
    destination = Path(destination_path).resolve()
    verify_sqlite_backup(backup, expected_sha256)
    if destination.exists() and not replace:
        raise FileExistsError(destination)
    if backup == destination:
        raise ValueError("バックアップ元と復元先が同一です")

    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.parent / f".{destination.name}.{uuid.uuid4().hex}.restore"
    try:
        shutil.copy2(backup, temporary)
        verify_sqlite_backup(temporary, expected_sha256)
        if replace:
            os.replace(temporary, destination)
        else:
            os.link(temporary, destination)
            temporary.unlink()
        return destination
    finally:
        temporary.unlink(missing_ok=True)
