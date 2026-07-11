"""メール受信による書類の自動取り込み（指示書04・Phase 2）

doslドメインの専用アドレス（例: hub@dosl.co.jp）をIMAPでポーリングし、
添付ファイルをDocumentとして取り込む。
- MAIL_INGEST_ENABLED=true のときだけ常駐タスクが起動（main.pyのlifespan）
- 送信元アドレスがusers.emailと一致した出展社にのみ紐づける（未登録は管理者通知のみ）
- カテゴリは件名に含まれるカテゴリ名で判定。判定不能なら専用カテゴリ
  「メール受信（未分類）」を自動作成して紐づけ、管理者が後から振り替える
- 多重取込防止は二重ガード: IMAP側の既読化（未読のみ取得） ／ DB側の source_message_id
"""
import asyncio
import email
import email.header
import email.message
import email.utils
import imaplib
import logging
import os
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import async_session
from app.models.booth import Booth
from app.models.document import Document
from app.models.exhibition import Exhibition
from app.models.notification import Notification
from app.models.submission_category import SubmissionCategory
from app.models.user import User
from app.services import storage
from app.services.ai_analyzer import analyze_document

logger = logging.getLogger(__name__)

UNCLASSIFIED_CATEGORY = "メール受信（未分類）"
ALLOWED_EXTENSIONS = {
    ".xlsx", ".xls", ".docx", ".doc", ".pdf",
    ".jpg", ".jpeg", ".png", ".heic", ".heif", ".tiff",
}
MIME_TYPES = {
    ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg", ".heic": "image/heic", ".heif": "image/heif",
    ".tiff": "image/tiff",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls": "application/vnd.ms-excel",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc": "application/msword",
}


# ──────────────── 判定ロジック（純粋関数・pytest対象） ────────────────

def match_category(subject: str, categories: list) -> object | None:
    """件名に名前が含まれるカテゴリを返す（最初に一致したもの。未分類カテゴリは対象外）"""
    for cat in categories:
        if cat.name == UNCLASSIFIED_CATEGORY:
            continue
        if cat.name and cat.name in (subject or ""):
            return cat
    return None


def pick_exhibition(subject: str, active_exhibitions: list) -> object | None:
    """展示会の特定: activeが1つならそれ。複数なら件名に名前を含むもの。判定不能はNone"""
    if len(active_exhibitions) == 1:
        return active_exhibitions[0]
    matches = [ex for ex in active_exhibitions if ex.name and ex.name in (subject or "")]
    if len(matches) == 1:
        return matches[0]
    return None


def extract_allowed_attachments(attachments: list[tuple[str, bytes]]) -> list[tuple[str, bytes]]:
    """対応形式・50MB以下の添付だけを返す"""
    result = []
    for filename, content in attachments:
        ext = os.path.splitext(filename or "")[1].lower()
        if ext in ALLOWED_EXTENSIONS and 0 < len(content) <= settings.max_file_size:
            result.append((filename, content))
    return result


# ──────────────── DB処理 ────────────────

async def _notify_managers(db: AsyncSession, title: str, message: str) -> None:
    managers = (await db.execute(
        select(User).where(User.role.in_(("admin", "organizer")), User.is_active.is_(True))
    )).scalars().all()
    for m in managers:
        db.add(Notification(user_id=m.id, type="mail_ingest", title=title, message=message))


async def _ensure_unclassified_category(db: AsyncSession, exhibition: Exhibition) -> SubmissionCategory:
    cat = (await db.execute(
        select(SubmissionCategory).where(
            SubmissionCategory.exhibition_id == exhibition.id,
            SubmissionCategory.name == UNCLASSIFIED_CATEGORY,
        )
    )).scalars().first()
    if cat:
        if not cat.is_active:
            cat.is_active = True
        return cat
    cat = SubmissionCategory(
        exhibition_id=exhibition.id,
        name=UNCLASSIFIED_CATEGORY,
        description="メールで届いた書類の一時受け皿。書類詳細から正しいカテゴリへ振り替えてください",
        recipient_org_id=exhibition.organizer_id,
        is_required=False,
        sort_order=99,
    )
    db.add(cat)
    await db.flush()
    return cat


async def ingest_message(db: AsyncSession, message_id: str, from_email: str,
                         subject: str, attachments: list[tuple[str, bytes]]) -> dict:
    """1通のメールを処理する。戻り値: {action, document_ids} （actionは検証・ログ用）

    action: imported / no_attachments / unknown_sender / exhibition_ambiguous / duplicate
    """
    # DB側の二重ガード
    dup = (await db.execute(
        select(Document.id).where(Document.source_message_id == message_id)
    )).first()
    if dup:
        return {"action": "duplicate", "document_ids": []}

    files = extract_allowed_attachments(attachments)
    if not files:
        return {"action": "no_attachments", "document_ids": []}

    sender = (await db.execute(
        select(User).options(selectinload(User.organization)).where(
            User.email == (from_email or "").lower(), User.is_active.is_(True)
        )
    )).scalars().first()
    if not sender:
        await _notify_managers(
            db, "未登録アドレスからのメール",
            f"{from_email} から書類らしきメール（件名: {subject or '（無題）'}）が届きましたが、"
            "登録ユーザーと一致しないため取り込みませんでした。",
        )
        await db.commit()
        return {"action": "unknown_sender", "document_ids": []}

    active = (await db.execute(
        select(Exhibition).where(Exhibition.status == "active").order_by(Exhibition.start_date.desc())
    )).scalars().all()
    exhibition = pick_exhibition(subject, active)
    if not exhibition:
        await _notify_managers(
            db, "メール取込を保留しました",
            f"{from_email} からのメール（件名: {subject or '（無題）'}）は対象の展示会を特定できないため"
            "保留中です。開催中の展示会が複数ある場合は、件名に展示会名を入れて再送を依頼してください。",
        )
        await db.commit()
        return {"action": "exhibition_ambiguous", "document_ids": []}

    categories = (await db.execute(
        select(SubmissionCategory).where(
            SubmissionCategory.exhibition_id == exhibition.id,
            SubmissionCategory.is_active.is_(True),
        ).order_by(SubmissionCategory.sort_order)
    )).scalars().all()
    category = match_category(subject, categories)
    if not category:
        category = await _ensure_unclassified_category(db, exhibition)

    booth = (await db.execute(
        select(Booth).where(
            Booth.exhibition_id == exhibition.id,
            Booth.exhibitor_id == sender.organization_id,
        )
    )).scalars().first()

    document_ids = []
    for filename, content in files:
        file_id = uuid.uuid4()
        safe_name = os.path.basename(filename or "mail-attachment")
        file_path = await storage.save_file(content, f"{exhibition.id}/{file_id}_{safe_name}")
        ext = os.path.splitext(safe_name)[1].lower()
        db.add(Document(
            id=file_id,
            exhibition_id=exhibition.id,
            submission_category_id=category.id,
            booth_id=booth.id if booth else None,
            uploaded_by_org_id=sender.organization_id,
            uploaded_by_user_id=sender.id,
            recipient_org_id=category.recipient_org_id,
            file_name=safe_name,
            file_type=MIME_TYPES.get(ext, "application/octet-stream"),
            file_size_bytes=len(content),
            storage_path=file_path,
            source_channel="email",
            source_message_id=message_id,
            status="received",
        ))
        document_ids.append(file_id)

    await db.commit()
    for doc_id in document_ids:
        asyncio.create_task(analyze_document(doc_id))
    logger.info("メール取込: %s から %d 件（件名: %s）", from_email, len(document_ids), subject)
    return {"action": "imported", "document_ids": document_ids}


# ──────────────── IMAP I/O ────────────────

def _decode_header(value: str) -> str:
    """RFC2047エンコードされたヘッダ（=?UTF-8?B?...?=等）をデコードする"""
    parts = []
    for text, charset in email.header.decode_header(value or ""):
        if isinstance(text, bytes):
            parts.append(text.decode(charset or "utf-8", errors="replace"))
        else:
            parts.append(text)
    return "".join(parts)


def _parse_address(header_value: str) -> str:
    """'名前 <a@b.com>' → 'a@b.com'"""
    return (email.utils.parseaddr(_decode_header(header_value))[1] or "").lower()


def _collect_attachments(msg: email.message.Message) -> list[tuple[str, bytes]]:
    result = []
    for part in msg.walk():
        filename = part.get_filename()
        if not filename:
            continue
        content = part.get_payload(decode=True)
        if content:
            result.append((_decode_header(filename), content))
    return result


def _connect() -> imaplib.IMAP4_SSL:
    conn = imaplib.IMAP4_SSL(settings.mail_imap_host, 993, timeout=30)
    conn.login(settings.mail_address, settings.mail_password)
    conn.select("INBOX")
    return conn


def _fetch_unread(conn: imaplib.IMAP4_SSL) -> list[dict]:
    """未読メールを取得して {uid, id, from_email, subject, attachments} のリストで返す。
    取得中に既読化されないよう BODY.PEEK で読む（既読化は処理後に明示的に行う）"""
    _, data = conn.uid("SEARCH", None, "UNSEEN")
    uids = (data[0] or b"").split()[:20]
    messages = []
    for uid in uids:
        _, msg_data = conn.uid("FETCH", uid, "(BODY.PEEK[])")
        if not msg_data or msg_data[0] is None or not isinstance(msg_data[0], tuple):
            continue
        msg = email.message_from_bytes(msg_data[0][1])
        # 多重取込防止キーはMessage-IDヘッダ。無い場合のみIMAP UIDで代替
        message_id = (msg.get("Message-ID") or "").strip() or f"imap-uid-{uid.decode()}"
        messages.append({
            "uid": uid,
            "id": message_id,
            "from_email": _parse_address(msg.get("From", "")),
            "subject": _decode_header(msg.get("Subject", "")),
            "attachments": _collect_attachments(msg),
        })
    return messages


def _mark_processed(conn: imaplib.IMAP4_SSL, uid: bytes) -> None:
    conn.uid("STORE", uid, "+FLAGS", "(\\Seen)")


def _logout(conn: imaplib.IMAP4_SSL) -> None:
    try:
        conn.close()
        conn.logout()
    except Exception:
        pass


# ──────────────── 常駐ポーリング ────────────────

# 「保留」メール（展示会を特定できない等）に毎回通知を出さないための記憶。
# プロセス再起動でリセットされる（再起動時に1回だけ再通知される）
_held_message_ids: set[str] = set()


async def poll_once() -> None:
    conn = await asyncio.to_thread(_connect)
    try:
        messages = await asyncio.to_thread(_fetch_unread, conn)
        for m in messages:
            if m["id"] in _held_message_ids:
                continue
            async with async_session() as db:
                result = await ingest_message(
                    db, m["id"], m["from_email"], m["subject"], m["attachments"])
            if result["action"] == "exhibition_ambiguous":
                # 保留: 未読のまま残す（展示会が絞れたら次回取り込まれる）
                _held_message_ids.add(m["id"])
                continue
            # imported / duplicate / unknown_sender / no_attachments は既読化
            await asyncio.to_thread(_mark_processed, conn, m["uid"])
    finally:
        await asyncio.to_thread(_logout, conn)


async def poll_loop() -> None:
    logger.info("メール取込ポーリングを開始します（間隔 %d 秒）", settings.mail_poll_interval_sec)
    while True:
        try:
            await poll_once()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("メール取込ポーリングでエラーが発生しました（次回に再試行）")
        await asyncio.sleep(settings.mail_poll_interval_sec)
