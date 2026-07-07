import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import require_manager, require_staff
from app.models.ai_analysis import AIAnalysis
from app.models.document import Document
from app.models.notification import Notification
from app.models.user import User
from app.schemas.document import ReviewRequest
from app.services.order_builder import create_order_from_analysis

router = APIRouter(prefix="/api/ai-analyses", tags=["ai-analyses"])


@router.get("/review-queue")
async def review_queue(
    exhibition_id: uuid.UUID | None = None,
    limit: int = 50,
    user: User = Depends(require_staff),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(AIAnalysis)
        .join(Document, AIAnalysis.document_id == Document.id)
        .options(
            selectinload(AIAnalysis.document).selectinload(Document.submission_category),
            selectinload(AIAnalysis.document).selectinload(Document.uploaded_by_org),
            selectinload(AIAnalysis.document).selectinload(Document.booth),
        )
        .where(AIAnalysis.review_status == "pending_review", Document.is_deleted.is_(False))
    )
    if exhibition_id:
        query = query.where(Document.exhibition_id == exhibition_id)
    if user.role == "partner":
        query = query.where(Document.recipient_org_id == user.organization_id)
    query = query.order_by(AIAnalysis.created_at.asc()).limit(min(limit, 100))

    analyses = (await db.execute(query)).scalars().all()
    return {
        "data": [
            {
                "id": str(a.id),
                "document": {
                    "id": str(a.document.id),
                    "file_name": a.document.file_name,
                    "file_type": a.document.file_type,
                    "submission_category_name": a.document.submission_category.name if a.document.submission_category else None,
                    "uploaded_by_org_name": a.document.uploaded_by_org.name if a.document.uploaded_by_org else None,
                    "booth_number": a.document.booth.booth_number if a.document.booth else None,
                },
                "confidence_score": float(a.confidence_score),
                "low_confidence_fields": a.low_confidence_fields or [],
                "structured_data": a.structured_data,
                "created_at": a.created_at.isoformat(),
            }
            for a in analyses
        ]
    }


@router.put("/{analysis_id}/review")
async def review_analysis(
    analysis_id: uuid.UUID,
    body: ReviewRequest,
    user: User = Depends(require_manager),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AIAnalysis)
        .options(selectinload(AIAnalysis.document).selectinload(Document.uploaded_by_org))
        .where(AIAnalysis.id == analysis_id)
    )
    analysis = result.scalar_one_or_none()
    if not analysis:
        raise HTTPException(status_code=404, detail="解析結果が見つかりません")
    if body.action not in ("approve", "approve_with_corrections", "reject"):
        raise HTTPException(status_code=400, detail="actionはapprove/approve_with_corrections/rejectのいずれかです")

    document = analysis.document
    analysis.reviewed_by_user_id = user.id
    analysis.reviewed_at = datetime.now(timezone.utc)
    analysis.review_notes = body.notes

    if body.action == "reject":
        analysis.review_status = "rejected"
        document.status = "error"  # UI上は「差し戻し」として表示
    else:
        if body.action == "approve_with_corrections" and body.corrected_data:
            merged = dict(analysis.structured_data or {})
            merged.update(body.corrected_data)
            analysis.structured_data = merged
        analysis.review_status = "reviewed"
        document.status = "confirmed"
        await create_order_from_analysis(db, document, analysis)

    await db.commit()

    # 提出元組織のユーザーへ結果を通知
    from app.models.user import User as UserModel
    uploaders = (await db.execute(
        select(UserModel).where(
            UserModel.organization_id == document.uploaded_by_org_id,
            UserModel.is_active.is_(True),
        )
    )).scalars().all()
    label = {"approve": "確認済", "approve_with_corrections": "修正のうえ確認済", "reject": "差し戻し"}[body.action]
    for u in uploaders:
        db.add(Notification(
            user_id=u.id,
            type="review_result",
            title=f"{label}: {document.file_name}",
            message=body.notes or "",
            reference_type="document",
            reference_id=document.id,
        ))
    await db.commit()

    return {"message": "レビューを保存しました", "document_status": document.status}
