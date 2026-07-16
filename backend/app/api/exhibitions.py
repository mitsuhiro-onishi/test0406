import csv
import io
import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, func, union
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.authorization import accessible_exhibition_ids, require_exhibition_access
from app.core.security import get_current_user, require_manager, require_staff
from app.models.booth import Booth
from app.models.document import Document
from app.models.exhibition import Exhibition
from app.models.order import Order
from app.models.organization import Organization
from app.models.submission_category import SubmissionCategory
from app.models.user import User
from app.schemas.document import (
    ExhibitionResponse,
    SubmissionCategoryCreate,
    SubmissionCategoryResponse,
)

router = APIRouter(prefix="/api", tags=["exhibitions"])

VALID_EXHIBITION_STATUSES = ("preparing", "active", "closed")


class ExhibitionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=300)
    venue: str = Field(min_length=1, max_length=200)
    start_date: date
    end_date: date
    status: str = "preparing"


class ExhibitionUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=300)
    venue: str | None = Field(default=None, min_length=1, max_length=200)
    start_date: date | None = None
    end_date: date | None = None
    status: str | None = None


def _exhibition_to_response(ex: Exhibition) -> ExhibitionResponse:
    return ExhibitionResponse(
        id=ex.id,
        name=ex.name,
        venue=ex.venue,
        start_date=str(ex.start_date),
        end_date=str(ex.end_date),
        status=ex.status,
        document_deadline=ex.document_deadline,
        accepting_applications=ex.accepting_applications,
    )


@router.get("/exhibitions", response_model=list[ExhibitionResponse])
async def list_exhibitions(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Exhibition)
        .where(Exhibition.id.in_(accessible_exhibition_ids(user)))
        .order_by(Exhibition.start_date.desc())
    )
    exhibitions = result.scalars().all()
    return [_exhibition_to_response(ex) for ex in exhibitions]


@router.post("/exhibitions", response_model=ExhibitionResponse, status_code=201)
async def create_exhibition(
    body: ExhibitionCreate,
    user: User = Depends(require_manager),
    db: AsyncSession = Depends(get_db),
):
    if body.status not in VALID_EXHIBITION_STATUSES:
        raise HTTPException(status_code=400, detail=f"statusは {', '.join(VALID_EXHIBITION_STATUSES)} のいずれかを指定してください")
    if body.end_date < body.start_date:
        raise HTTPException(status_code=400, detail="会期終了日は開始日以降の日付を指定してください")

    ex = Exhibition(
        name=body.name.strip(),
        venue=body.venue.strip(),
        start_date=body.start_date,
        end_date=body.end_date,
        organizer_id=user.organization_id,
        status=body.status,
    )
    db.add(ex)
    await db.commit()
    return _exhibition_to_response(ex)


@router.patch("/exhibitions/{exhibition_id}", response_model=ExhibitionResponse)
async def update_exhibition(
    exhibition_id: uuid.UUID,
    body: ExhibitionUpdate,
    user: User = Depends(require_manager),
    db: AsyncSession = Depends(get_db),
):
    await require_exhibition_access(db, user, exhibition_id, write=True)
    ex = await db.get(Exhibition, exhibition_id)
    if not ex:
        raise HTTPException(status_code=404, detail="展示会が見つかりません")
    if body.status is not None and body.status not in VALID_EXHIBITION_STATUSES:
        raise HTTPException(status_code=400, detail=f"statusは {', '.join(VALID_EXHIBITION_STATUSES)} のいずれかを指定してください")

    new_start = body.start_date if body.start_date is not None else ex.start_date
    new_end = body.end_date if body.end_date is not None else ex.end_date
    if new_end < new_start:
        raise HTTPException(status_code=400, detail="会期終了日は開始日以降の日付を指定してください")

    if body.name is not None:
        ex.name = body.name.strip()
    if body.venue is not None:
        ex.venue = body.venue.strip()
    ex.start_date = new_start
    ex.end_date = new_end
    if body.status is not None:
        ex.status = body.status
    await db.commit()
    return _exhibition_to_response(ex)


@router.get("/exhibitions/{exhibition_id}/summary")
async def exhibition_summary(
    exhibition_id: uuid.UUID,
    user: User = Depends(require_staff),
    db: AsyncSession = Depends(get_db),
):
    """管理ダッシュボードのサマリー統計"""
    await require_exhibition_access(db, user, exhibition_id)
    doc_where = [Document.exhibition_id == exhibition_id, Document.is_deleted.is_(False)]
    if user.role == "partner":
        doc_where.append(Document.recipient_org_id == user.organization_id)

    status_rows = (await db.execute(
        select(Document.status, func.count())
        .where(*doc_where)
        .group_by(Document.status)
    )).all()
    by_status = {s: c for s, c in status_rows}

    total_booths = (await db.execute(
        select(func.count()).select_from(Booth).where(Booth.exhibition_id == exhibition_id)
    )).scalar() or 0
    assigned_booths = (await db.execute(
        select(func.count()).select_from(Booth).where(
            Booth.exhibition_id == exhibition_id, Booth.exhibitor_id.is_not(None)
        )
    )).scalar() or 0

    order_query = select(func.count(), func.coalesce(func.sum(Order.total_amount), 0)).where(
        Order.exhibition_id == exhibition_id
    )
    order_count, order_amount = (await db.execute(order_query)).one()

    # カテゴリ別の提出状況（必須カテゴリ: 出展社ごとに1件以上で提出済み扱い）
    exhibitor_count = (await db.execute(
        select(func.count(func.distinct(Booth.exhibitor_id))).where(
            Booth.exhibition_id == exhibition_id, Booth.exhibitor_id.is_not(None)
        )
    )).scalar() or 0

    categories = (await db.execute(
        select(SubmissionCategory)
        .where(SubmissionCategory.exhibition_id == exhibition_id, SubmissionCategory.is_active.is_(True))
        .order_by(SubmissionCategory.sort_order)
    )).scalars().all()
    category_progress = []
    for cat in categories:
        submitted = (await db.execute(
            select(func.count(func.distinct(Document.uploaded_by_org_id))).where(
                Document.submission_category_id == cat.id, Document.is_deleted.is_(False)
            )
        )).scalar() or 0
        category_progress.append({
            "id": str(cat.id),
            "name": cat.name,
            "is_required": cat.is_required,
            "submitted_org_count": submitted,
            "expected_org_count": exhibitor_count,
            "rate": round(submitted / exhibitor_count, 2) if exhibitor_count else 0,
        })

    recent = (await db.execute(
        select(Document)
        .options(
            selectinload(Document.submission_category),
            selectinload(Document.uploaded_by_org),
            selectinload(Document.ai_analyses),
        )
        .where(*doc_where)
        .order_by(Document.created_at.desc())
        .limit(8)
    )).scalars().all()

    return {
        "data": {
            "total_booths": total_booths,
            "assigned_booths": assigned_booths,
            "total_documents": sum(by_status.values()),
            "documents_by_status": {
                "received": by_status.get("received", 0),
                "processing": by_status.get("processing", 0),
                "analyzed": by_status.get("analyzed", 0),
                "review_needed": by_status.get("review_needed", 0),
                "confirmed": by_status.get("confirmed", 0),
                "error": by_status.get("error", 0),
                "analysis_failed": by_status.get("analysis_failed", 0),
            },
            "total_orders": order_count,
            "total_order_amount": float(order_amount or 0),
            "category_progress": category_progress,
            "recent_documents": [
                {
                    "id": str(d.id),
                    "file_name": d.file_name,
                    "status": d.status,
                    "category_name": d.submission_category.name if d.submission_category else None,
                    "uploaded_by_org_name": d.uploaded_by_org.name if d.uploaded_by_org else None,
                    "confidence_score": float(d.ai_analyses[0].confidence_score) if d.ai_analyses else None,
                    "created_at": d.created_at.isoformat(),
                }
                for d in recent
            ],
        }
    }


@router.get(
    "/exhibitions/{exhibition_id}/submission-categories",
    response_model=list[SubmissionCategoryResponse],
)
async def list_submission_categories(
    exhibition_id: uuid.UUID,
    include_inactive: bool = False,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_exhibition_access(db, user, exhibition_id)
    query = (
        select(SubmissionCategory)
        .options(selectinload(SubmissionCategory.recipient_org))
        .where(SubmissionCategory.exhibition_id == exhibition_id)
        .order_by(SubmissionCategory.sort_order)
    )
    if user.role == "partner":
        query = query.where(
            SubmissionCategory.recipient_org_id == user.organization_id
        )
    if not include_inactive:
        query = query.where(SubmissionCategory.is_active.is_(True))
    categories = (await db.execute(query)).scalars().all()

    count_where = [
        Document.exhibition_id == exhibition_id,
        Document.is_deleted.is_(False),
    ]
    if user.role == "exhibitor":
        count_where.append(Document.uploaded_by_org_id == user.organization_id)
    if user.role == "partner":
        count_where.append(Document.recipient_org_id == user.organization_id)
    counts = dict((await db.execute(
        select(Document.submission_category_id, func.count())
        .where(*count_where)
        .group_by(Document.submission_category_id)
    )).all())
    org_counts = dict((await db.execute(
        select(Document.submission_category_id, func.count(func.distinct(Document.uploaded_by_org_id)))
        .where(*count_where)
        .group_by(Document.submission_category_id)
    )).all())

    return [
        SubmissionCategoryResponse(
            id=cat.id,
            name=cat.name,
            description=cat.description,
            recipient_org_id=cat.recipient_org_id,
            recipient_org_name=cat.recipient_org.name if cat.recipient_org else None,
            is_required=cat.is_required,
            deadline=cat.deadline,
            sort_order=cat.sort_order,
            is_active=cat.is_active,
            document_count=counts.get(cat.id, 0),
            submitted_org_count=org_counts.get(cat.id, 0),
        )
        for cat in categories
    ]


@router.post(
    "/exhibitions/{exhibition_id}/submission-categories",
    response_model=SubmissionCategoryResponse,
    status_code=201,
)
async def create_submission_category(
    exhibition_id: uuid.UUID,
    body: SubmissionCategoryCreate,
    user: User = Depends(require_manager),
    db: AsyncSession = Depends(get_db),
):
    await require_exhibition_access(db, user, exhibition_id, write=True)
    if not await db.get(Exhibition, exhibition_id):
        raise HTTPException(status_code=404, detail="展示会が見つかりません")
    recipient = await db.get(Organization, body.recipient_org_id)
    if not recipient:
        raise HTTPException(status_code=404, detail="受取先組織が見つかりません")

    cat = SubmissionCategory(
        exhibition_id=exhibition_id,
        name=body.name,
        description=body.description,
        recipient_org_id=body.recipient_org_id,
        is_required=body.is_required,
        deadline=body.deadline,
        sort_order=body.sort_order,
    )
    db.add(cat)
    await db.commit()

    return SubmissionCategoryResponse(
        id=cat.id, name=cat.name, description=cat.description,
        recipient_org_id=cat.recipient_org_id, recipient_org_name=recipient.name,
        is_required=cat.is_required, deadline=cat.deadline,
        sort_order=cat.sort_order, is_active=cat.is_active,
    )


@router.put(
    "/exhibitions/{exhibition_id}/submission-categories/{category_id}",
    response_model=SubmissionCategoryResponse,
)
async def update_submission_category(
    exhibition_id: uuid.UUID,
    category_id: uuid.UUID,
    body: SubmissionCategoryCreate,
    user: User = Depends(require_manager),
    db: AsyncSession = Depends(get_db),
):
    await require_exhibition_access(db, user, exhibition_id, write=True)
    cat = await db.get(SubmissionCategory, category_id)
    if not cat or cat.exhibition_id != exhibition_id:
        raise HTTPException(status_code=404, detail="提出カテゴリが見つかりません")
    recipient = await db.get(Organization, body.recipient_org_id)
    if not recipient:
        raise HTTPException(status_code=404, detail="受取先組織が見つかりません")

    cat.name = body.name
    cat.description = body.description
    cat.recipient_org_id = body.recipient_org_id
    cat.is_required = body.is_required
    cat.deadline = body.deadline
    cat.sort_order = body.sort_order
    await db.commit()

    return SubmissionCategoryResponse(
        id=cat.id, name=cat.name, description=cat.description,
        recipient_org_id=cat.recipient_org_id, recipient_org_name=recipient.name,
        is_required=cat.is_required, deadline=cat.deadline,
        sort_order=cat.sort_order, is_active=cat.is_active,
    )


@router.delete("/exhibitions/{exhibition_id}/submission-categories/{category_id}", status_code=204)
async def delete_submission_category(
    exhibition_id: uuid.UUID,
    category_id: uuid.UUID,
    user: User = Depends(require_manager),
    db: AsyncSession = Depends(get_db),
):
    await require_exhibition_access(db, user, exhibition_id, write=True)
    cat = await db.get(SubmissionCategory, category_id)
    if not cat or cat.exhibition_id != exhibition_id:
        raise HTTPException(status_code=404, detail="提出カテゴリが見つかりません")
    doc_count = (await db.execute(
        select(func.count()).select_from(Document).where(
            Document.submission_category_id == category_id, Document.is_deleted.is_(False)
        )
    )).scalar() or 0
    if doc_count:
        # ドキュメントが紐づくカテゴリは物理削除せず無効化する
        cat.is_active = False
        await db.commit()
        return
    await db.delete(cat)
    await db.commit()


@router.post(
    "/exhibitions/{exhibition_id}/submission-categories/copy-from/{source_exhibition_id}",
    status_code=201,
)
async def copy_submission_categories(
    exhibition_id: uuid.UUID,
    source_exhibition_id: uuid.UUID,
    user: User = Depends(require_manager),
    db: AsyncSession = Depends(get_db),
):
    await require_exhibition_access(db, user, exhibition_id, write=True)
    await require_exhibition_access(db, user, source_exhibition_id)
    if not await db.get(Exhibition, exhibition_id):
        raise HTTPException(status_code=404, detail="展示会が見つかりません")
    source_cats = (await db.execute(
        select(SubmissionCategory).where(
            SubmissionCategory.exhibition_id == source_exhibition_id,
            SubmissionCategory.is_active.is_(True),
        ).order_by(SubmissionCategory.sort_order)
    )).scalars().all()
    existing_names = set((await db.execute(
        select(SubmissionCategory.name).where(SubmissionCategory.exhibition_id == exhibition_id)
    )).scalars().all())

    copied = 0
    for src in source_cats:
        if src.name in existing_names:
            continue
        db.add(SubmissionCategory(
            exhibition_id=exhibition_id,
            name=src.name,
            description=src.description,
            recipient_org_id=src.recipient_org_id,
            is_required=src.is_required,
            deadline=None,  # 期限はコピーしない
            sort_order=src.sort_order,
        ))
        copied += 1
    await db.commit()
    return {"data": {"copied_count": copied}}


@router.get("/organizations")
async def list_organizations(
    org_type: str | None = None,
    search: str | None = None,
    user: User = Depends(require_manager),
    db: AsyncSession = Depends(get_db),
):
    query = select(Organization).order_by(Organization.name)
    if user.role != "admin":
        owned_exhibitions = select(Exhibition.id).where(
            Exhibition.organizer_id == user.organization_id
        )
        relevant_org_ids = union(
            select(Organization.id).where(Organization.id == user.organization_id),
            select(Booth.exhibitor_id).where(
                Booth.exhibition_id.in_(owned_exhibitions),
                Booth.exhibitor_id.is_not(None),
            ),
            select(SubmissionCategory.recipient_org_id).where(
                SubmissionCategory.exhibition_id.in_(owned_exhibitions)
            ),
        )
        query = query.where(Organization.id.in_(relevant_org_ids))
    if org_type:
        query = query.where(Organization.org_type == org_type)
    if search:
        query = query.where(Organization.name.ilike(f"%{search.strip()}%"))
    orgs = (await db.execute(query)).scalars().all()
    # ユーザー管理画面用に所属ユーザー数・連絡先も返す（ドロップダウン用途はid/name/org_typeのみ参照）
    counts = dict((await db.execute(
        select(User.organization_id, func.count()).group_by(User.organization_id)
    )).all())
    return {
        "data": [
            {
                "id": str(o.id),
                "name": o.name,
                "org_type": o.org_type,
                "contact_email": o.contact_email,
                "contact_phone": o.contact_phone,
                "user_count": counts.get(o.id, 0),
            }
            for o in orgs
        ]
    }


@router.get("/exhibitions/{exhibition_id}/reports/documents.csv")
async def export_documents_csv(
    exhibition_id: uuid.UUID,
    user: User = Depends(require_staff),
    db: AsyncSession = Depends(get_db),
):
    await require_exhibition_access(db, user, exhibition_id)
    where = [Document.exhibition_id == exhibition_id, Document.is_deleted.is_(False)]
    if user.role == "partner":
        where.append(Document.recipient_org_id == user.organization_id)
    docs = (await db.execute(
        select(Document)
        .options(
            selectinload(Document.submission_category),
            selectinload(Document.uploaded_by_org),
            selectinload(Document.recipient_org),
            selectinload(Document.booth),
            selectinload(Document.ai_analyses),
        )
        .where(*where)
        .order_by(Document.created_at)
    )).scalars().all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "受信日時", "出展社", "ブース", "提出カテゴリ", "受取先", "ファイル名",
        "受信方法", "ステータス", "AI信頼度", "レビュー状態",
    ])
    status_label = {
        "received": "受信", "processing": "解析中", "analyzed": "解析済",
        "review_needed": "要レビュー", "confirmed": "確認済", "error": "差し戻し",
        "analysis_failed": "解析失敗",
    }
    for d in docs:
        latest = d.ai_analyses[0] if d.ai_analyses else None
        writer.writerow([
            d.created_at.isoformat(),
            d.uploaded_by_org.name if d.uploaded_by_org else "",
            d.booth.booth_number if d.booth else "",
            d.submission_category.name if d.submission_category else "",
            d.recipient_org.name if d.recipient_org else "",
            d.file_name,
            {"camera_capture": "カメラ撮影", "email": "メール受信"}.get(d.source_channel, "Webアップロード"),
            status_label.get(d.status, d.status),
            f"{float(latest.confidence_score):.2f}" if latest else "",
            latest.review_status if latest else "",
        ])

    data = "\ufeff" + buf.getvalue()
    return StreamingResponse(
        io.BytesIO(data.encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=documents.csv"},
    )
