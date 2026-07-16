#!/usr/bin/env python3
"""DOSL HUB SQLiteバックアップを作成し、専用GCSバケットへ保存する。"""

import argparse
import os
from pathlib import Path
import sys


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.services.sqlite_backup import (  # noqa: E402
    create_sqlite_backup,
    prune_local_backups,
    upload_backup_to_gcs,
    verify_sqlite_backup,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source",
        default=os.environ.get(
            "DOSL_DB_PATH", "/opt/dosl-hub/data/exhibition.db"
        ),
    )
    parser.add_argument(
        "--output-dir",
        default=os.environ.get(
            "DOSL_BACKUP_DIR", "/opt/dosl-hub/data/backups"
        ),
    )
    parser.add_argument(
        "--bucket",
        default=os.environ.get("BACKUP_GCS_BUCKET", ""),
    )
    parser.add_argument(
        "--prefix",
        default=os.environ.get("BACKUP_GCS_PREFIX", "sqlite/hourly"),
    )
    parser.add_argument(
        "--no-upload",
        action="store_true",
        help="ローカル検証専用。GCSへアップロードしない",
    )
    parser.add_argument(
        "--local-retention-hours",
        type=int,
        default=int(os.environ.get("BACKUP_LOCAL_RETENTION_HOURS", "48")),
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.no_upload and not args.bucket:
        raise SystemExit("BACKUP_GCS_BUCKETが未設定です")

    artifact = create_sqlite_backup(args.source, args.output_dir)
    verify_sqlite_backup(artifact.database_path, artifact.sha256)
    print(f"backup_created={artifact.database_path}")
    print(f"sha256={artifact.sha256}")

    if not args.no_upload:
        for uri in upload_backup_to_gcs(
            artifact,
            args.bucket,
            prefix=args.prefix,
        ):
            print(f"backup_uploaded={uri}")
        for path in prune_local_backups(
            args.output_dir,
            retention_hours=args.local_retention_hours,
        ):
            print(f"local_backup_pruned={path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
