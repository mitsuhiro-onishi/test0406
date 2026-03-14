"""テスト用のシードデータを投入するエンドポイント（開発環境のみ）"""
import uuid
from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.organization import Organization
from app.models.exhibition import Exhibition
from app.models.submission_category import SubmissionCategory
from app.models.booth import Booth

router = APIRouter(prefix="/api/seed", tags=["seed"])


@router.post("")
async def seed_data(db: AsyncSession = Depends(get_db)):
    # Organizations
    organizer = Organization(id=uuid.uuid4(), name="国際展示会主催株式会社", org_type="organizer")
    decorator = Organization(id=uuid.uuid4(), name="○○装飾株式会社", org_type="decorator")
    electric = Organization(id=uuid.uuid4(), name="△△電気工事株式会社", org_type="partner")
    catering = Organization(id=uuid.uuid4(), name="□□フードサービス", org_type="partner")
    exhibitor_a = Organization(id=uuid.uuid4(), name="出展社A株式会社", org_type="exhibitor")
    exhibitor_b = Organization(id=uuid.uuid4(), name="出展社Bコーポレーション", org_type="exhibitor")

    db.add_all([organizer, decorator, electric, catering, exhibitor_a, exhibitor_b])

    # Exhibition
    exhibition = Exhibition(
        id=uuid.uuid4(),
        name="第15回 国際産業展示会",
        venue="東京ビッグサイト",
        start_date=date(2026, 6, 1),
        end_date=date(2026, 6, 3),
        organizer_id=organizer.id,
        status="active",
    )
    db.add(exhibition)

    # Submission Categories
    cat_booth = SubmissionCategory(
        id=uuid.uuid4(), exhibition_id=exhibition.id,
        name="コマ申込", description="ブースの小間割・レイアウトに関する申込書",
        recipient_org_id=decorator.id, is_required=True, sort_order=1,
    )
    cat_design = SubmissionCategory(
        id=uuid.uuid4(), exhibition_id=exhibition.id,
        name="ブース設営", description="ブースの施工・設営に関する設計書",
        recipient_org_id=decorator.id, is_required=True, sort_order=2,
    )
    cat_electric = SubmissionCategory(
        id=uuid.uuid4(), exhibition_id=exhibition.id,
        name="電気申込", description="電気工事・照明に関する申込書",
        recipient_org_id=electric.id, is_required=True, sort_order=3,
    )
    cat_food = SubmissionCategory(
        id=uuid.uuid4(), exhibition_id=exhibition.id,
        name="弁当注文", description="出展者向け弁当・ケータリングの注文書",
        recipient_org_id=catering.id, is_required=False, sort_order=4,
    )
    cat_equipment = SubmissionCategory(
        id=uuid.uuid4(), exhibition_id=exhibition.id,
        name="備品レンタル", description="テーブル・椅子・ショーケース等の備品レンタル申込",
        recipient_org_id=decorator.id, is_required=False, sort_order=5,
    )

    db.add_all([cat_booth, cat_design, cat_electric, cat_food, cat_equipment])

    # Booths
    booths = [
        Booth(id=uuid.uuid4(), exhibition_id=exhibition.id, booth_number="A-01", exhibitor_id=exhibitor_a.id, status="assigned"),
        Booth(id=uuid.uuid4(), exhibition_id=exhibition.id, booth_number="A-02", exhibitor_id=exhibitor_b.id, status="assigned"),
        Booth(id=uuid.uuid4(), exhibition_id=exhibition.id, booth_number="A-03", status="vacant"),
    ]
    db.add_all(booths)

    await db.commit()

    return {
        "message": "シードデータを投入しました",
        "exhibition_id": str(exhibition.id),
        "exhibitors": [
            {"name": exhibitor_a.name, "id": str(exhibitor_a.id)},
            {"name": exhibitor_b.name, "id": str(exhibitor_b.id)},
        ],
    }
