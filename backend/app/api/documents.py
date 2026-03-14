import os
import uuid
from datetime import datetime

import aiofiles
from fastapi import APIRouter, Depends, File, Form, UploadFile, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.models.document import Document
from app.models.submission_category import SubmissionCategory
from app.schemas.document import DocumentResponse, DocumentListResponse

router = APIRouter(prefix="/api/documents", tags=["documents"])

ALLOWED_EXTENSIONS = {
    ".xlsx", ".xls", ".docx", ".doc", ".pdf",
    ".jpg", ".jpeg", ".png", ".heic", ".heif", ".tiff",
}


@router.post("/upload", response_model=DocumentResponse, status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    exhibition_id: uuid.UUID = Form(...),
    submission_category_id: uuid.UUID = Form(...),
    booth_id: uuid.UUID | None = Form(None),
    source: str = Form("file"),
    db: AsyncSession = Depends(get_db),
):
    # Validate file extension
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"対応していないファイル形式です: {ext}")

    # Validate file size
    content = await file.read()
    if len(content) > settings.max_file_size:
        raise HTTPException(status_code=400, detail="ファイルサイズが50MBを超えています")

    # Get submission category and recipient
    category = await db.get(SubmissionCategory, submission_category_id)
    if not category:
        raise HTTPException(status_code=404, detail="提出カテゴリが見つかりません")
    if str(category.exhibition_id) != str(exhibition_id):
        raise HTTPException(status_code=400, detail="提出カテゴリが展示会と一致しません")

    # Save file
    file_id = uuid.uuid4()
    upload_dir = os.path.join(settings.upload_dir, str(exhibition_id), str(file_id))
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, file.filename or "upload")

    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)

    # Create document record
    source_channel = "camera_capture" if source == "camera" else "web_upload"

    document = Document(
        id=file_id,
        exhibition_id=exhibition_id,
        submission_category_id=submission_category_id,
        booth_id=booth_id,
        uploaded_by_org_id=category.recipient_org_id,  # TODO: replace with auth user's org
        uploaded_by_user_id=None,  # TODO: replace with auth user
        recipient_org_id=category.recipient_org_id,
        file_name=file.filename or "upload",
        file_type=file.content_type or "application/octet-stream",
        file_size_bytes=len(content),
        storage_path=file_path,
        source_channel=source_channel,
        status="received",
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)

    return DocumentResponse(
        id=document.id,
        exhibition_id=document.exhibition_id,
        submission_category_id=document.submission_category_id,
        submission_category_name=category.name,
        recipient_org_name=None,
        booth_id=document.booth_id,
        file_name=document.file_name,
        file_type=document.file_type,
        file_size_bytes=document.file_size_bytes,
        source_channel=document.source_channel,
        status=document.status,
        created_at=document.created_at,
    )


@router.get("", response_model=DocumentListResponse)
async def list_documents(
    exhibition_id: uuid.UUID | None = None,
    submission_category_id: uuid.UUID | None = None,
    status: str | None = None,
    limit: int = 20,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    query = select(Document).options(
        selectinload(Document.submission_category)
    )

    if exhibition_id:
        query = query.where(Document.exhibition_id == exhibition_id)
    if submission_category_id:
        query = query.where(Document.submission_category_id == submission_category_id)
    if status:
        query = query.where(Document.status == status)

    # Count
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Fetch
    query = query.order_by(Document.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(query)
    documents = result.scalars().all()

    return DocumentListResponse(
        data=[
            DocumentResponse(
                id=doc.id,
                exhibition_id=doc.exhibition_id,
                submission_category_id=doc.submission_category_id,
                submission_category_name=doc.submission_category.name if doc.submission_category else None,
                recipient_org_name=None,
                booth_id=doc.booth_id,
                file_name=doc.file_name,
                file_type=doc.file_type,
                file_size_bytes=doc.file_size_bytes,
                source_channel=doc.source_channel,
                status=doc.status,
                created_at=doc.created_at,
            )
            for doc in documents
        ],
        total=total,
    )


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Document)
        .options(selectinload(Document.submission_category))
        .where(Document.id == document_id)
    )
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail="ドキュメントが見つかりません")

    return DocumentResponse(
        id=document.id,
        exhibition_id=document.exhibition_id,
        submission_category_id=document.submission_category_id,
        submission_category_name=document.submission_category.name if document.submission_category else None,
        recipient_org_name=None,
        booth_id=document.booth_id,
        file_name=document.file_name,
        file_type=document.file_type,
        file_size_bytes=document.file_size_bytes,
        source_channel=document.source_channel,
        status=document.status,
        created_at=document.created_at,
    )
