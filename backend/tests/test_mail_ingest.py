"""メール取込（指示書04）の判定ロジックとDB処理のテスト

実行: cd backend && .venv/bin/python -m pytest tests/ -v
"""
import os
import tempfile
import uuid
from datetime import date

# app読み込み前にテスト用の環境を固定する
_TMP = tempfile.mkdtemp(prefix="dosl-mail-test-")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_TMP}/test.db"
os.environ["UPLOAD_DIR"] = f"{_TMP}/uploads"
os.environ["AI_PROVIDER"] = "mock"
os.environ["STORAGE_BACKEND"] = "local"

import pytest
from sqlalchemy import select

from app.core.database import async_session, engine, Base
from app.models.exhibition import Exhibition
from app.models.document import Document
from app.models.notification import Notification
from app.models.organization import Organization
from app.models.submission_category import SubmissionCategory
from app.models.user import User
from app.services import mail_ingest
from app.services.mail_ingest import (
    UNCLASSIFIED_CATEGORY,
    extract_allowed_attachments,
    ingest_message,
    match_category,
    pick_exhibition,
)


class FakeNamed:
    def __init__(self, name):
        self.name = name


# ──────────────── 純粋関数 ────────────────

def test_match_category_by_subject():
    cats = [FakeNamed("電気申込"), FakeNamed("弁当注文")]
    assert match_category("電気申込 3コマ分", cats).name == "電気申込"
    assert match_category("Re: 【弁当注文】5月末納品分", cats).name == "弁当注文"
    assert match_category("よろしくお願いします", cats) is None
    assert match_category("", cats) is None


def test_match_category_skips_unclassified():
    cats = [FakeNamed(UNCLASSIFIED_CATEGORY)]
    assert match_category(f"件名に{UNCLASSIFIED_CATEGORY}を含む", cats) is None


def test_pick_exhibition_single_active():
    ex = FakeNamed("第15回 国際産業展示会")
    assert pick_exhibition("何の件名でも", [ex]) is ex


def test_pick_exhibition_multiple_by_subject():
    a, b = FakeNamed("春の展示会"), FakeNamed("秋の展示会")
    assert pick_exhibition("秋の展示会 電気申込", [a, b]) is b
    assert pick_exhibition("展示会の書類です", [a, b]) is None  # 判定不能
    assert pick_exhibition("", [a, b]) is None


def test_extract_allowed_attachments():
    files = [
        ("申込書.pdf", b"x" * 10),
        ("マクロ.exe", b"x" * 10),           # 対応外拡張子
        ("巨大.png", b"x" * (51 * 1024 * 1024)),  # 50MB超
        ("空.xlsx", b""),                     # 空ファイル
        ("写真.JPG", b"x" * 10),              # 大文字拡張子はOK
    ]
    kept = [f for f, _ in extract_allowed_attachments(files)]
    assert kept == ["申込書.pdf", "写真.JPG"]


# ──────────────── DB処理（ingest_message） ────────────────

@pytest.fixture(autouse=True)
async def _no_background_analysis(monkeypatch):
    """テスト中はAI解析のバックグラウンド起動を無効化"""
    async def _noop(document_id):
        return None
    monkeypatch.setattr(mail_ingest, "analyze_document", _noop)


@pytest.fixture()
async def seeded():
    """組織2・ユーザー1・展示会1・カテゴリ1の最小データ"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    async with async_session() as db:
        organizer = Organization(name="主催", org_type="organizer")
        exhibitor = Organization(name="出展社A", org_type="exhibitor")
        db.add_all([organizer, exhibitor])
        await db.flush()
        ex = Exhibition(
            name="テスト展示会", venue="会場", status="active",
            start_date=date(2026, 9, 1), end_date=date(2026, 9, 2),
            organizer_id=organizer.id,
        )
        db.add(ex)
        await db.flush()
        cat = SubmissionCategory(
            exhibition_id=ex.id, name="電気申込", recipient_org_id=organizer.id,
            is_required=True, sort_order=1,
        )
        sender = User(
            organization_id=exhibitor.id, email="tanto@exhibitor-a.example.com",
            name="担当者", hashed_password="x", role="exhibitor",
        )
        db.add_all([cat, sender])
        await db.commit()
        return {"exhibition_id": ex.id, "manager_org_id": organizer.id}


async def _add_manager(email="kanri@example.com"):
    async with async_session() as db:
        org = (await db.execute(select(Organization).where(Organization.org_type == "organizer"))).scalars().first()
        db.add(User(organization_id=org.id, email=email, name="管理者",
                    hashed_password="x", role="organizer"))
        await db.commit()


async def test_ingest_known_sender_with_category(seeded):
    async with async_session() as db:
        result = await ingest_message(
            db, "msg-001", "tanto@exhibitor-a.example.com",
            "電気申込 3コマ分", [("電気申込書.pdf", b"dummy")])
    assert result["action"] == "imported"
    async with async_session() as db:
        doc = (await db.execute(select(Document))).scalars().one()
        assert doc.source_channel == "email"
        assert doc.source_message_id == "msg-001"
        cat = await db.get(SubmissionCategory, doc.submission_category_id)
        assert cat.name == "電気申込"


async def test_ingest_duplicate_message_id(seeded):
    async with async_session() as db:
        await ingest_message(db, "msg-dup", "tanto@exhibitor-a.example.com",
                             "電気申込", [("a.pdf", b"x")])
    async with async_session() as db:
        result = await ingest_message(db, "msg-dup", "tanto@exhibitor-a.example.com",
                                      "電気申込", [("a.pdf", b"x")])
    assert result["action"] == "duplicate"
    async with async_session() as db:
        docs = (await db.execute(select(Document))).scalars().all()
        assert len(docs) == 1


async def test_ingest_unknown_sender_notifies_managers(seeded):
    await _add_manager()
    async with async_session() as db:
        result = await ingest_message(
            db, "msg-002", "shiranai@example.com", "書類です", [("a.pdf", b"x")])
    assert result["action"] == "unknown_sender"
    async with async_session() as db:
        docs = (await db.execute(select(Document))).scalars().all()
        assert docs == []
        notif = (await db.execute(select(Notification))).scalars().all()
        assert len(notif) == 1
        assert "未登録アドレス" in notif[0].title


async def test_ingest_no_valid_attachments(seeded):
    async with async_session() as db:
        result = await ingest_message(
            db, "msg-003", "tanto@exhibitor-a.example.com", "電気申込", [("virus.exe", b"x")])
    assert result["action"] == "no_attachments"


async def test_ingest_unmatched_subject_goes_to_unclassified(seeded):
    async with async_session() as db:
        result = await ingest_message(
            db, "msg-004", "tanto@exhibitor-a.example.com",
            "よろしくお願いします", [("書類.pdf", b"x")])
    assert result["action"] == "imported"
    async with async_session() as db:
        doc = (await db.execute(select(Document))).scalars().one()
        cat = await db.get(SubmissionCategory, doc.submission_category_id)
        assert cat.name == UNCLASSIFIED_CATEGORY
        assert cat.recipient_org_id is not None


async def test_ingest_ambiguous_exhibition_held(seeded):
    await _add_manager("kanri2@example.com")
    async with async_session() as db:
        org = (await db.execute(select(Organization).where(Organization.org_type == "organizer"))).scalars().first()
        db.add(Exhibition(
            name="もうひとつの展示会", venue="会場B", status="active",
            start_date=date(2026, 10, 1), end_date=date(2026, 10, 2),
            organizer_id=org.id,
        ))
        await db.commit()
    async with async_session() as db:
        result = await ingest_message(
            db, "msg-005", "tanto@exhibitor-a.example.com",
            "電気申込です", [("a.pdf", b"x")])
    assert result["action"] == "exhibition_ambiguous"
    async with async_session() as db:
        docs = (await db.execute(select(Document))).scalars().all()
        assert docs == []
        notif = (await db.execute(select(Notification))).scalars().all()
        assert any("保留" in n.title for n in notif)
