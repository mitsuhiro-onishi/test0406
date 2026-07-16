"""アップロード、日次クォータ、AI同時実行数の回帰テスト。"""

import asyncio
from io import BytesIO

import pytest
from fastapi import FastAPI, HTTPException, Request, UploadFile
from fastapi.testclient import TestClient

from app.api.documents import bulk_upload_documents, reanalyze_document
from app.core.database import Base, async_session, engine
from app.core.request_limits import RequestBodyLimitMiddleware
from app.models.user import User
from app.services.ai_queue import AIJobQueue
from app.services.quota import QuotaExceeded, consume_quota
from app.services.storage import FileTooLargeError, save_upload


def test_app_rejects_oversize_request_before_endpoint_body_parsing():
    limited_app = FastAPI()
    limited_app.add_middleware(RequestBodyLimitMiddleware, max_body_size=10)

    @limited_app.post("/upload")
    async def upload(request: Request):
        return {"size": len(await request.body())}

    with TestClient(limited_app) as client:
        response = client.post("/upload", content=b"x" * 11)

    assert response.status_code == 413
    assert "サイズ上限" in response.json()["detail"]


async def test_bulk_upload_rejects_too_many_files_before_database_work():
    files = [
        UploadFile(filename=f"{index}.pdf", file=BytesIO(b"x"))
        for index in range(6)
    ]
    with pytest.raises(HTTPException) as error:
        await bulk_upload_documents(
            files=files,
            exhibition_id="unused",
            submission_category_id="unused",
            booth_id=None,
            source="file",
            user=None,
            db=None,
        )
    assert error.value.status_code == 400


async def test_exhibitor_cannot_trigger_paid_reanalysis():
    user = User(
        organization_id="00000000-0000-0000-0000-000000000001",
        email="exhibitor@example.com",
        name="出展者",
        hashed_password="x",
        role="exhibitor",
    )
    with pytest.raises(HTTPException) as error:
        await reanalyze_document(
            document_id="00000000-0000-0000-0000-000000000002",
            user=user,
            db=None,
        )
    assert error.value.status_code == 403


async def test_streaming_upload_rejects_oversize_and_removes_partial_file(
    tmp_path, monkeypatch
):
    from app.services import storage

    monkeypatch.setattr(storage.settings, "storage_backend", "local")
    monkeypatch.setattr(storage.settings, "upload_dir", str(tmp_path))
    upload = UploadFile(filename="large.pdf", file=BytesIO(b"123456789"))

    with pytest.raises(FileTooLargeError):
        await save_upload(upload, "exhibition/large.pdf", max_bytes=5, chunk_size=4)

    assert not (tmp_path / "exhibition" / "large.pdf").exists()


async def test_database_quota_enforces_count_and_bytes_across_calls():
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)

    async with async_session() as database:
        await consume_quota(
            database,
            action="upload_daily",
            identity="user-1",
            window="2026-07-16",
            count=1,
            byte_count=40,
            max_count=2,
            max_bytes=100,
        )
        await consume_quota(
            database,
            action="upload_daily",
            identity="user-1",
            window="2026-07-16",
            count=1,
            byte_count=50,
            max_count=2,
            max_bytes=100,
        )
        with pytest.raises(QuotaExceeded):
            await consume_quota(
                database,
                action="upload_daily",
                identity="user-1",
                window="2026-07-16",
                count=1,
                byte_count=1,
                max_count=2,
                max_bytes=100,
            )

    # 別ユーザー・別日には影響しない。
    async with async_session() as database:
        await consume_quota(
            database,
            action="upload_daily",
            identity="user-2",
            window="2026-07-16",
            count=1,
            byte_count=100,
            max_count=2,
            max_bytes=100,
        )
        await consume_quota(
            database,
            action="upload_daily",
            identity="user-1",
            window="2026-07-17",
            count=1,
            byte_count=100,
            max_count=2,
            max_bytes=100,
        )


async def test_ai_queue_never_exceeds_configured_concurrency():
    active = 0
    peak = 0
    completed = []

    async def worker(job):
        nonlocal active, peak
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(0.01)
        completed.append(job)
        active -= 1

    queue = AIJobQueue(worker=worker, concurrency=1)
    await queue.start(recover=False)
    try:
        await asyncio.gather(*(queue.enqueue(job) for job in ("a", "b", "c")))
        await queue.join()
    finally:
        await queue.stop()

    assert peak == 1
    assert completed == ["a", "b", "c"]


async def test_ai_queue_deduplicates_pending_document_ids():
    gate = asyncio.Event()
    completed = []

    async def worker(job):
        await gate.wait()
        completed.append(job)

    queue = AIJobQueue(worker=worker, concurrency=1)
    await queue.start(recover=False)
    try:
        assert await queue.enqueue("same-id") is True
        assert await queue.enqueue("same-id") is False
        gate.set()
        await queue.join()
    finally:
        await queue.stop()

    assert completed == ["same-id"]
