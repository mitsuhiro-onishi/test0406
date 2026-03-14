import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.exhibition import Exhibition
from app.models.submission_category import SubmissionCategory
from app.schemas.document import ExhibitionResponse, SubmissionCategoryResponse

router = APIRouter(prefix="/api/exhibitions", tags=["exhibitions"])


@router.get("", response_model=list[ExhibitionResponse])
async def list_exhibitions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Exhibition).order_by(Exhibition.start_date.desc())
    )
    exhibitions = result.scalars().all()
    return [
        ExhibitionResponse(
            id=ex.id,
            name=ex.name,
            venue=ex.venue,
            start_date=str(ex.start_date),
            end_date=str(ex.end_date),
            status=ex.status,
        )
        for ex in exhibitions
    ]


@router.get("/{exhibition_id}/submission-categories", response_model=list[SubmissionCategoryResponse])
async def list_submission_categories(
    exhibition_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SubmissionCategory)
        .options(selectinload(SubmissionCategory.recipient_org))
        .where(SubmissionCategory.exhibition_id == exhibition_id)
        .where(SubmissionCategory.is_active.is_(True))
        .order_by(SubmissionCategory.sort_order)
    )
    categories = result.scalars().all()
    return [
        SubmissionCategoryResponse(
            id=cat.id,
            name=cat.name,
            description=cat.description,
            recipient_org_id=cat.recipient_org_id,
            recipient_org_name=cat.recipient_org.name if cat.recipient_org else None,
            is_required=cat.is_required,
            sort_order=cat.sort_order,
        )
        for cat in categories
    ]
