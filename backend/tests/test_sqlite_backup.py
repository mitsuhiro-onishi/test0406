"""SQLiteオンラインバックアップと復元の回帰テスト。"""

import sqlite3
from datetime import datetime, timedelta, timezone
import os

import pytest

from app.services.sqlite_backup import (
    BackupValidationError,
    create_sqlite_backup,
    prune_local_backups,
    restore_sqlite_backup,
    upload_backup_to_gcs,
    verify_sqlite_backup,
)


def create_source_database(path):
    connection = sqlite3.connect(path)
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("CREATE TABLE registrations (id INTEGER, ticket TEXT)")
    connection.execute("INSERT INTO registrations VALUES (1, 'SAFE1234')")
    connection.commit()
    return connection


def test_online_backup_is_consistent_while_source_connection_is_open(tmp_path):
    source = tmp_path / "exhibition.db"
    source_connection = create_source_database(source)
    try:
        artifact = create_sqlite_backup(
            source,
            tmp_path / "backups",
            now=datetime(2026, 7, 16, 1, 2, 3, tzinfo=timezone.utc),
        )
    finally:
        source_connection.close()

    assert artifact.database_path.name == "dosl-hub-db-20260716T010203Z.sqlite3"
    assert artifact.checksum_path.exists()
    assert verify_sqlite_backup(artifact.database_path, artifact.sha256)

    with sqlite3.connect(artifact.database_path) as backup:
        assert backup.execute("PRAGMA integrity_check").fetchone() == ("ok",)
        assert backup.execute("SELECT ticket FROM registrations").fetchone() == (
            "SAFE1234",
        )


def test_backup_tampering_is_detected(tmp_path):
    source = tmp_path / "exhibition.db"
    create_source_database(source).close()
    artifact = create_sqlite_backup(source, tmp_path / "backups")

    with artifact.database_path.open("ab") as stream:
        stream.write(b"tampered")

    with pytest.raises(BackupValidationError):
        verify_sqlite_backup(artifact.database_path, artifact.sha256)


def test_restore_verifies_backup_and_refuses_implicit_overwrite(tmp_path):
    source = tmp_path / "exhibition.db"
    create_source_database(source).close()
    artifact = create_sqlite_backup(source, tmp_path / "backups")
    restored = tmp_path / "restore" / "exhibition.db"

    restore_sqlite_backup(
        artifact.database_path,
        restored,
        expected_sha256=artifact.sha256,
    )
    with sqlite3.connect(restored) as database:
        assert database.execute("SELECT COUNT(*) FROM registrations").fetchone() == (
            1,
        )

    with pytest.raises(FileExistsError):
        restore_sqlite_backup(
            artifact.database_path,
            restored,
            expected_sha256=artifact.sha256,
        )


def test_gcs_upload_uses_create_only_and_includes_checksum_metadata(tmp_path):
    source = tmp_path / "exhibition.db"
    create_source_database(source).close()
    artifact = create_sqlite_backup(source, tmp_path / "backups")

    class FakeBlob:
        def __init__(self, name):
            self.name = name
            self.metadata = None
            self.uploads = []

        def upload_from_filename(self, filename, **kwargs):
            self.uploads.append((filename, kwargs))

    class FakeBucket:
        def __init__(self):
            self.blobs = []

        def blob(self, name):
            blob = FakeBlob(name)
            self.blobs.append(blob)
            return blob

    class FakeClient:
        def __init__(self):
            self.bucket_name = None
            self.fake_bucket = FakeBucket()

        def bucket(self, name):
            self.bucket_name = name
            return self.fake_bucket

    client = FakeClient()
    uris = upload_backup_to_gcs(
        artifact,
        "dosl-hub-backups",
        prefix="sqlite/hourly",
        client=client,
    )

    assert client.bucket_name == "dosl-hub-backups"
    assert uris == [
        f"gs://dosl-hub-backups/sqlite/hourly/{artifact.database_path.name}",
        f"gs://dosl-hub-backups/sqlite/hourly/{artifact.checksum_path.name}",
    ]
    database_blob = client.fake_bucket.blobs[0]
    assert database_blob.metadata == {"sha256": artifact.sha256}
    assert database_blob.uploads[0][1]["if_generation_match"] == 0


def test_local_retention_removes_only_expired_managed_backups(tmp_path):
    now = datetime(2026, 7, 16, 12, 0, tzinfo=timezone.utc)
    old_database = tmp_path / "dosl-hub-db-20260713T010203Z.sqlite3"
    old_checksum = tmp_path / f"{old_database.name}.sha256"
    recent_database = tmp_path / "dosl-hub-db-20260716T010203Z.sqlite3"
    unrelated = tmp_path / "manual-copy.sqlite3"
    for path in (old_database, old_checksum, recent_database, unrelated):
        path.write_text("fixture")
    old_timestamp = (now - timedelta(hours=72)).timestamp()
    os.utime(old_database, (old_timestamp, old_timestamp))
    os.utime(old_checksum, (old_timestamp, old_timestamp))

    removed = prune_local_backups(tmp_path, retention_hours=48, now=now)

    assert removed == [old_database, old_checksum]
    assert recent_database.exists()
    assert unrelated.exists()
