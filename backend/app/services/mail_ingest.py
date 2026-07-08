"""メール受信による書類の自動取り込み（指示書04・Phase 2）

専用Gmailアカウントをポーリングし、添付ファイルをDocumentとして取り込む。
- MAIL_INGEST_ENABLED=true のときだけ常駐タスクが起動（main.pyのlifespan）
- 送信元アドレスがusers.emailと一致した出展社にのみ紐づける（未登録は管理者通知のみ）
- カテゴリは件名に含まれるカテゴリ名で判定。判定不能なら専用カテゴリ
  「メール受信（未分類）」を自動作成して紐づけ、管理者が後から振り替える
- 多重取込防止は二重ガード: Gmail側のラベル＋既読化 ／ DB側の source_message_id
"""
import asyncio
import base64
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

GMAIL_LABEL = "DOSL-HUB取込済"
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


# ──────────────── Gmail I/O ────────────────

def _gmail_service():
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build

    creds = Credentials(
        None,
        refresh_token=settings.gmail_refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.gmail_client_id,
        client_secret=settings.gmail_client_secret,
        scopes=["https://www.googleapis.com/auth/gmail.modify"],
    )
    return build("gmail", "v1", credentials=creds, cache_discovery=False)


def _ensure_label(service) -> str:
    labels = service.users().labels().list(userId="me").execute().get("labels", [])
    for lb in labels:
        if lb["name"] == GMAIL_LABEL:
            return lb["id"]
    created = service.users().labels().create(
        userId="me", body={"name": GMAIL_LABEL}).execute()
    return created["id"]


def _parse_address(header_value: str) -> str:
    """'名前 <a@b.com>' → 'a@b.com'"""
    import email.utils
    return (email.utils.parseaddr(header_value or "")[1] or "").lower()


def _collect_attachments(service, msg_id: str, payload: dict) -> list[tuple[str, bytes]]:
    result = []
    parts = [payload]
    while parts:
        part = parts.pop()
        parts.extend(part.get("parts") or [])
        filename = part.get("filename")
        body = part.get("body") or {}
        if not filename:
            continue
        if body.get("attachmentId"):
            att = service.users().messages().attachments().get(
                userId="me", messageId=msg_id, id=body["attachmentId"]).execute()
            result.append((filename, base64.urlsafe_b64decode(att["data"])))
        elif body.get("data"):
            result.append((filename, base64.urlsafe_b64decode(body["data"])))
    return result


def _fetch_unread(service) -> list[dict]:
    """未読メールを取得して {id, from_email, subject, attachments} のリストで返す"""
    res = service.users().messages().list(
        userId="me", q="is:unread", maxResults=20).execute()
    messages = []
    for ref in res.get("messages", []):
        msg = service.users().messages().get(userId="me", id=ref["id"]).execute()
        headers = {h["name"].lower(): h["value"]
                   for h in (msg.get("payload", {}).get("headers") or [])}
        messages.append({
            "id": msg["id"],
            "from_email": _parse_address(headers.get("from", "")),
            "subject": headers.get("subject", ""),
            "attachments": _collect_attachments(service, msg["id"], msg.get("payload", {})),
        })
    return messages


def _mark_processed(service, msg_id: str, label_id: str) -> None:
    service.users().messages().modify(
        userId="me", id=msg_id,
        body={"removeLabelIds": ["UNREAD"], "addLabelIds": [label_id]},
    ).execute()


# ──────────────── 常駐ポーリング ────────────────

# 「保留」メール（展示会を特定できない等）に毎回通知を出さないための記憶。
# プロセス再起動でリセットされる（再起動時に1回だけ再通知される）
_held_message_ids: set[str] = set()


async def poll_once() -> None:
    service = await asyncio.to_thread(_gmail_service)
    label_id = await asyncio.to_thread(_ensure_label, service)
    messages = await asyncio.to_thread(_fetch_unread, service)
    for m in messages:
        async with async_session() as db:
            if m["id"] in _held_message_ids:
                continue
            result = await ingest_message(
                db, m["id"], m["from_email"], m["subject"], m["attachments"])
        if result["action"] == "exhibition_ambiguous":
            # 保留: 未読のまま残す（展示会が絞れたら次回取り込まれる）
            _held_message_ids.add(m["id"])
            continue
        # imported / duplicate / unknown_sender / no_attachments は既読化＋ラベル
        await asyncio.to_thread(_mark_processed, service, m["id"], label_id)


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
