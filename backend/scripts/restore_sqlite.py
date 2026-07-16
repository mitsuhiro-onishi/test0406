#!/usr/bin/env python3
"""検証済みSQLiteバックアップを指定パスへ復元する。"""

import argparse
from pathlib import Path
import sys


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.services.sqlite_backup import restore_sqlite_backup  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--backup", required=True)
    parser.add_argument("--destination", required=True)
    parser.add_argument("--sha256")
    parser.add_argument("--checksum-file")
    parser.add_argument(
        "--replace",
        action="store_true",
        help="既存DBを置換する。dosl-hub停止後のみ指定する",
    )
    return parser.parse_args()


def checksum_from_file(path: str | Path) -> str:
    content = Path(path).read_text(encoding="ascii").strip().split()
    if not content:
        raise ValueError("チェックサムファイルが空です")
    return content[0]


def main() -> int:
    args = parse_args()
    expected_sha256 = args.sha256
    if args.checksum_file:
        checksum = checksum_from_file(args.checksum_file)
        if expected_sha256 and checksum != expected_sha256:
            raise SystemExit("指定SHA-256とチェックサムファイルが一致しません")
        expected_sha256 = checksum
    if not expected_sha256:
        raise SystemExit("--sha256 または --checksum-file が必要です")

    restored = restore_sqlite_backup(
        args.backup,
        args.destination,
        expected_sha256=expected_sha256,
        replace=args.replace,
    )
    print(f"restored={restored}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
