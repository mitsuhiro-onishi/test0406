"""ファイル保存の抽象レイヤ（ローカルディスク / Google Cloud Storage）

- 環境変数 STORAGE_BACKEND=local|gcs で切替（デフォルトlocal＝ローカル開発は従来どおり）
- GCS時の storage_path は gs://<bucket>/<exhibition_id>/<uuid>_<safe_filename>
- 読み出しは storage_path の接頭辞で判定するため、GCS移行後も
  旧ローカルパスの書類はそのまま読める（既存ファイルの移行は不要）
- google-cloud-storage は同期ライブラリなので asyncio.to_thread でラップする
- 認証はVMのデフォルトサービスアカウント（ADC）
"""
import asyncio
import os
import tempfile

import aiofiles

from app.core.config import settings


def is_gcs(storage_path: str) -> bool:
    return storage_path.startswith("gs://")


def _split_gcs(storage_path: str) -> tuple[str, str]:
    bucket, _, key = storage_path.removeprefix("gs://").partition("/")
    return bucket, key


def _gcs_bucket(name: str):
    from google.cloud import storage as gcs

    return gcs.Client().bucket(name)


async def save_file(data: bytes, key: str) -> str:
    """保存して storage_path を返す。key例: <exhibition_id>/<uuid>_<filename>"""
    if settings.storage_backend == "gcs":
        if not settings.gcs_bucket:
            raise RuntimeError("STORAGE_BACKEND=gcs には GCS_BUCKET の設定が必要です")

        def _upload():
            _gcs_bucket(settings.gcs_bucket).blob(key).upload_from_string(data)

        await asyncio.to_thread(_upload)
        return f"gs://{settings.gcs_bucket}/{key}"

    path = os.path.join(settings.upload_dir, key)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    async with aiofiles.open(path, "wb") as f:
        await f.write(data)
    return path


async def read_file(storage_path: str) -> bytes:
    """ローカル/GCS両対応の読み出し。存在しなければ FileNotFoundError"""
    if is_gcs(storage_path):
        from google.cloud.exceptions import NotFound

        bucket, key = _split_gcs(storage_path)

        def _download() -> bytes:
            try:
                return _gcs_bucket(bucket).blob(key).download_as_bytes()
            except NotFound:
                raise FileNotFoundError(storage_path)

        return await asyncio.to_thread(_download)

    if not os.path.exists(storage_path):
        raise FileNotFoundError(storage_path)
    async with aiofiles.open(storage_path, "rb") as f:
        return await f.read()


async def open_local(storage_path: str) -> str:
    """AI解析用にローカルパスを返す。

    GCSの場合は一時ファイルにダウンロードしてそのパスを返す。
    呼び出し側は使用後に「返り値 != storage_path なら削除」すること（finally推奨）。
    拡張子は解析側の形式判定に使われるため元ファイル名から引き継ぐ。
    """
    if not is_gcs(storage_path):
        return storage_path

    data = await read_file(storage_path)
    suffix = os.path.splitext(storage_path)[1]
    fd, tmp_path = tempfile.mkstemp(suffix=suffix, prefix="doslhub_")
    with os.fdopen(fd, "wb") as f:
        f.write(data)
    return tmp_path
