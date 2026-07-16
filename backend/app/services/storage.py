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
from fastapi import UploadFile

from app.core.config import settings


class FileTooLargeError(ValueError):
    pass


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


async def _stream_upload_to_path(
    upload: UploadFile,
    path: str,
    *,
    max_bytes: int,
    chunk_size: int,
) -> int:
    size = 0
    try:
        async with aiofiles.open(path, "wb") as destination:
            while chunk := await upload.read(chunk_size):
                size += len(chunk)
                if size > max_bytes:
                    raise FileTooLargeError(f"file exceeds {max_bytes} bytes")
                await destination.write(chunk)
    except Exception:
        try:
            os.remove(path)
        except FileNotFoundError:
            pass
        raise
    return size


async def save_upload(
    upload: UploadFile,
    key: str,
    *,
    max_bytes: int,
    chunk_size: int = 1024 * 1024,
) -> tuple[str, int]:
    """UploadFileを一定サイズずつ保存し、全量をPythonメモリへ載せない。"""
    if settings.storage_backend == "gcs":
        if not settings.gcs_bucket:
            raise RuntimeError("STORAGE_BACKEND=gcs には GCS_BUCKET の設定が必要です")
        fd, staged_path = tempfile.mkstemp(prefix="doslhub_upload_")
        os.close(fd)
        try:
            size = await _stream_upload_to_path(
                upload, staged_path, max_bytes=max_bytes, chunk_size=chunk_size
            )

            def _upload():
                _gcs_bucket(settings.gcs_bucket).blob(key).upload_from_filename(
                    staged_path
                )

            await asyncio.to_thread(_upload)
            return f"gs://{settings.gcs_bucket}/{key}", size
        finally:
            try:
                os.remove(staged_path)
            except FileNotFoundError:
                pass

    path = os.path.join(settings.upload_dir, key)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    size = await _stream_upload_to_path(
        upload, path, max_bytes=max_bytes, chunk_size=chunk_size
    )
    return path, size


async def delete_file(storage_path: str) -> None:
    """保存直後にDB/クォータ処理が失敗した場合の補償削除。"""
    if is_gcs(storage_path):
        bucket, key = _split_gcs(storage_path)
        await asyncio.to_thread(_gcs_bucket(bucket).blob(key).delete)
        return
    try:
        os.remove(storage_path)
    except FileNotFoundError:
        pass


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

    suffix = os.path.splitext(storage_path)[1]
    fd, tmp_path = tempfile.mkstemp(suffix=suffix, prefix="doslhub_")
    os.close(fd)
    bucket, key = _split_gcs(storage_path)
    try:
        def _download():
            from google.cloud.exceptions import NotFound

            try:
                _gcs_bucket(bucket).blob(key).download_to_filename(tmp_path)
            except NotFound:
                raise FileNotFoundError(storage_path)

        await asyncio.to_thread(_download)
        return tmp_path
    except Exception:
        try:
            os.remove(tmp_path)
        except FileNotFoundError:
            pass
        raise
