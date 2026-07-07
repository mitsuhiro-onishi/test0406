import os
import uuid
from datetime import date, datetime, time as dtime, timezone

import aiofiles
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, UploadFile, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.booth import Booth
from app.models.document import Document
from app.models.organization import Organization
from app.models.submission_category import SubmissionCategory
from app.models.user import User
from app.schemas.document import (
    AIAnalysisSummary,
    DocumentDetailResponse,
    DocumentListResponse,
    DocumentResponse,
)
from app.services.ai_analyzer import analyze_document

router = APIRouter(prefix="/api/documents", tags=["documents"])

ALLOWED_EXTENSIONS = {
    ".xlsx", ".xls", ".docx", ".doc", ".pdf",
    ".jpg", ".jpeg", ".png", ".heic", ".heif", ".tiff",
}

DOCUMENT_LOAD_OPTIONS = (
    selectinload(Document.submission_category),
    selectinload(Document.recipient_org),
    selectinload(Document.uploaded_by_org),
    selectinload(Document.booth),
    selectinload(Document.ai_analyses),
)


def apply_role_filter(query, user: User):
    """ロールに応じて閲覧可能なドキュメントに絞り込む"""
    if user.role == "exhibitor":
        return query.where(Document.uploaded_by_org_id == user.organization_id)
    if user.role == "partner":
        return query.where(Document.recipient_org_id == user.organization_id)
    return query  # admin / organizer / viewer は全件


def to_response(doc: Document, detail: bool = False) -> DocumentResponse:
    latest = doc.ai_analyses[0] if doc.ai_analyses else None
    base = dict(
        id=doc.id,
        exhibition_id=doc.exhibition_id,
        submission_category_id=doc.submission_category_id,
        submission_category_name=doc.submission_category.name if doc.submission_category else None,
        recipient_org_name=doc.recipient_org.name if doc.recipient_org else None,
        uploaded_by_org_name=doc.uploaded_by_org.name if doc.uploaded_by_org else None,
        booth_id=doc.booth_id,
        booth_number=doc.booth.booth_number if doc.booth else None,
        file_name=doc.file_name,
        file_type=doc.file_type,
        file_size_bytes=doc.file_size_bytes,
        source_channel=doc.source_channel,
        document_category=doc.document_category,
        status=doc.status,
        confidence_score=float(latest.confidence_score) if latest else None,
        review_status=latest.review_status if latest else None,
        created_at=doc.created_at,
    )
    if detail:
        return DocumentDetailResponse(
            **base,
            ai_analysis=AIAnalysisSummary.model_validate(latest) if latest else None,
        )
    return DocumentResponse(**base)


async def get_visible_document(document_id: uuid.UUID, user: User, db: AsyncSession) -> Document:
    result = await db.execute(
        apply_role_filter(
            select(Document).options(*DOCUMENT_LOAD_OPTIONS).where(
                Document.id == document_id, Document.is_deleted.is_(False)
            ),
            user,
        )
    )
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail="ドキュメントが見つかりません")
    return document


async def _validate_category(
    db: AsyncSession, exhibition_id: uuid.UUID, submission_category_id: uuid.UUID
) -> SubmissionCategory:
    category = await db.get(SubmissionCategory, submission_category_id)
    if not category:
        raise HTTPException(status_code=404, detail="提出カテゴリが見つかりません")
    if str(category.exhibition_id) != str(exhibition_id):
        raise HTTPException(status_code=400, detail="提出カテゴリが展示会と一致しません")
    return category


async def _resolve_booth(
    db: AsyncSession, exhibition_id: uuid.UUID, booth_id: uuid.UUID | None, user: User
) -> uuid.UUID | None:
    # ブース未指定なら出展社の割当ブースを自動設定
    if booth_id is None and user.role == "exhibitor":
        booth = (await db.execute(
            select(Booth).where(
                Booth.exhibition_id == exhibition_id,
                Booth.exhibitor_id == user.organization_id,
            )
        )).scalars().first()
        return booth.id if booth else None
    return booth_id


async def _save_one(
    file: UploadFile,
    exhibition_id: uuid.UUID,
    category: SubmissionCategory,
    booth_id: uuid.UUID | None,
    source: str,
    user: User,
    db: AsyncSession,
) -> Document:
    """1ファイルをバリデーション・保存してDocumentを作る（単一・一括アップロード共通）"""
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"対応していないファイル形式です: {ext}")

    content = await file.read()
    if len(content) > settings.max_file_size:
        raise HTTPException(status_code=400, detail="ファイルサイズが50MBを超えています")

    file_id = uuid.uuid4()
    upload_dir = os.path.join(settings.upload_dir, str(exhibition_id), str(file_id))
    os.makedirs(upload_dir, exist_ok=True)
    safe_name = os.path.basename(file.filename or "upload")
    file_path = os.path.join(upload_dir, safe_name)

    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)

    document = Document(
        id=file_id,
        exhibition_id=exhibition_id,
        submission_category_id=category.id,
        booth_id=booth_id,
        uploaded_by_org_id=user.organization_id,
        uploaded_by_user_id=user.id,
        recipient_org_id=category.recipient_org_id,
        file_name=safe_name,
        file_type=file.content_type or "application/octet-stream",
        file_size_bytes=len(content),
        storage_path=file_path,
        source_channel="camera_capture" if source == "camera" else "web_upload",
        status="received",
    )
    db.add(document)
    await db.commit()
    return document


@router.post("/upload", response_model=DocumentResponse, status_code=201)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    exhibition_id: uuid.UUID = Form(...),
    submission_category_id: uuid.UUID = Form(...),
    booth_id: uuid.UUID | None = Form(None),
    source: str = Form("file"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    category = await _validate_category(db, exhibition_id, submission_category_id)
    booth_id = await _resolve_booth(db, exhibition_id, booth_id, user)
    document = await _save_one(file, exhibition_id, category, booth_id, source, user, db)

    background_tasks.add_task(analyze_document, document.id)

    result = await db.execute(
        select(Document).options(*DOCUMENT_LOAD_OPTIONS).where(Document.id == document.id)
    )
    return to_response(result.scalar_one())


@router.post("/bulk-upload")
async def bulk_upload_documents(
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    exhibition_id: uuid.UUID = Form(...),
    submission_category_id: uuid.UUID = Form(...),
    booth_id: uuid.UUID | None = Form(None),
    source: str = Form("file"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """複数ファイルを1リクエストで受ける。失敗したファイルがあっても他は保存する（207相当を200で返す）"""
    if len(files) > 20:
        raise HTTPException(status_code=400, detail="一度にアップロードできるのは20ファイルまでです")

    category = await _validate_category(db, exhibition_id, submission_category_id)
    booth_id = await _resolve_booth(db, exhibition_id, booth_id, user)

    results = []
    for file in files:
        try:
            document = await _save_one(file, exhibition_id, category, booth_id, source, user, db)
            background_tasks.add_task(analyze_document, document.id)
            results.append({"file_name": file.filename, "ok": True, "id": str(document.id)})
        except HTTPException as e:
            results.append({"file_name": file.filename, "ok": False, "error": e.detail})
    return {"data": results}


@router.get("", response_model=DocumentListResponse)
async def list_documents(
    exhibition_id: uuid.UUID | None = None,
    submission_category_id: uuid.UUID | None = None,
    status: str | None = None,
    recipient_org_id: uuid.UUID | None = None,
    uploaded_by_org_id: uuid.UUID | None = None,
    source_channel: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    q: str | None = None,
    limit: int = 20,
    offset: int = 0,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Document).options(*DOCUMENT_LOAD_OPTIONS).where(Document.is_deleted.is_(False))
    query = apply_role_filter(query, user)

    if exhibition_id:
        query = query.where(Document.exhibition_id == exhibition_id)
    if submission_category_id:
        query = query.where(Document.submission_category_id == submission_category_id)
    if status:
        query = query.where(Document.status == status)
    if recipient_org_id:
        query = query.where(Document.recipient_org_id == recipient_org_id)
    if uploaded_by_org_id:
        query = query.where(Document.uploaded_by_org_id == uploaded_by_org_id)
    if source_channel:
        query = query.where(Document.source_channel == source_channel)
    if date_from:
        query = query.where(Document.created_at >= datetime.combine(date_from, dtime.min, tzinfo=timezone.utc))
    if date_to:
        query = query.where(Document.created_at <= datetime.combine(date_to, dtime.max, tzinfo=timezone.utc))
    if q:
        like = f"%{q}%"
        query = query.outerjoin(Organization, Document.uploaded_by_org_id == Organization.id).where(
            or_(Document.file_name.like(like), Organization.name.like(like))
        )

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    query = query.order_by(Document.created_at.desc()).limit(min(limit, 100)).offset(offset)
    documents = (await db.execute(query)).scalars().all()

    return DocumentListResponse(data=[to_response(d) for d in documents], total=total)


@router.get("/{document_id}", response_model=DocumentDetailResponse)
async def get_document(
    document_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    document = await get_visible_document(document_id, user, db)
    return to_response(document, detail=True)


@router.get("/{document_id}/download")
async def download_document(
    document_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    document = await get_visible_document(document_id, user, db)
    if not os.path.exists(document.storage_path):
        raise HTTPException(status_code=404, detail="ファイルが見つかりません")
    return FileResponse(document.storage_path, filename=document.file_name, media_type=document.file_type)


@router.post("/{document_id}/reanalyze", status_code=202)
async def reanalyze_document(
    document_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    document = await get_visible_document(document_id, user, db)
    document.status = "received"
    await db.commit()
    background_tasks.add_task(analyze_document, document.id)
    return {"message": "再解析を開始しました", "document_id": str(document.id)}


@router.delete("/{document_id}", status_code=204)
async def delete_document(
    document_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    document = await get_visible_document(document_id, user, db)
    if user.role in ("partner", "viewer"):
        raise HTTPException(status_code=403, detail="削除権限がありません")
    document.is_deleted = True
    await db.commit()
