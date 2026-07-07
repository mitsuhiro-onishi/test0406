"""テスト用のシードデータを投入するエンドポイント（開発環境のみ）"""
import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import hash_password
from app.models.organization import Organization
from app.models.exhibition import Exhibition
from app.models.submission_category import SubmissionCategory
from app.models.booth import Booth
from app.models.user import User

router = APIRouter(prefix="/api/seed", tags=["seed"])

# デモアカウント（メール / パスワード / ロール）
DEMO_USERS = [
    ("admin@dosl-hub.example.com", "admin1234", "admin", "organizer_org", "管理者 太郎"),
    ("organizer@dosl-hub.example.com", "organizer1234", "organizer", "organizer_org", "主催 花子"),
    ("exhibitor-a@dosl-hub.example.com", "exhibitor1234", "exhibitor", "exhibitor_a", "出展 一郎"),
    ("exhibitor-b@dosl-hub.example.com", "exhibitor1234", "exhibitor", "exhibitor_b", "出展 二郎"),
    ("decorator@dosl-hub.example.com", "partner1234", "partner", "decorator", "装飾 三郎"),
    ("electric@dosl-hub.example.com", "partner1234", "partner", "electric", "電気 四郎"),
    ("catering@dosl-hub.example.com", "partner1234", "partner", "catering", "弁当 五郎"),
]


@router.post("")
async def seed_data(db: AsyncSession = Depends(get_db)):
    if not settings.enable_seed:
        raise HTTPException(status_code=404, detail="Not Found")
    existing = (await db.execute(select(func.count()).select_from(Exhibition))).scalar() or 0
    if existing:
        return {"message": "シード済みのためスキップしました"}

    # Organizations
    orgs = {
        "organizer_org": Organization(id=uuid.uuid4(), name="国際展示会主催株式会社", org_type="organizer"),
        "decorator": Organization(id=uuid.uuid4(), name="○○装飾株式会社", org_type="decorator"),
        "electric": Organization(id=uuid.uuid4(), name="△△電気工事株式会社", org_type="partner"),
        "catering": Organization(id=uuid.uuid4(), name="□□フードサービス", org_type="partner"),
        "exhibitor_a": Organization(id=uuid.uuid4(), name="出展社A株式会社", org_type="exhibitor"),
        "exhibitor_b": Organization(id=uuid.uuid4(), name="出展社Bコーポレーション", org_type="exhibitor"),
    }
    db.add_all(orgs.values())

    # Users
    for email, password, role, org_key, name in DEMO_USERS:
        db.add(User(
            id=uuid.uuid4(),
            organization_id=orgs[org_key].id,
            email=email,
            name=name,
            hashed_password=hash_password(password),
            role=role,
            is_active=True,
        ))

    # Exhibition
    exhibition = Exhibition(
        id=uuid.uuid4(),
        name="第15回 国際産業展示会",
        venue="東京ビッグサイト",
        start_date=date(2026, 9, 9),
        end_date=date(2026, 9, 11),
        organizer_id=orgs["organizer_org"].id,
        status="active",
    )
    db.add(exhibition)

    # Submission Categories
    cats = [
        SubmissionCategory(
            id=uuid.uuid4(), exhibition_id=exhibition.id,
            name="コマ申込", description="ブースの小間割・レイアウトに関する申込書",
            recipient_org_id=orgs["decorator"].id, is_required=True, sort_order=1,
        ),
        SubmissionCategory(
            id=uuid.uuid4(), exhibition_id=exhibition.id,
            name="ブース設営", description="ブースの施工・設営に関する設計書",
            recipient_org_id=orgs["decorator"].id, is_required=True, sort_order=2,
        ),
        SubmissionCategory(
            id=uuid.uuid4(), exhibition_id=exhibition.id,
            name="電気申込", description="電気工事・照明に関する申込書",
            recipient_org_id=orgs["electric"].id, is_required=True, sort_order=3,
        ),
        SubmissionCategory(
            id=uuid.uuid4(), exhibition_id=exhibition.id,
            name="弁当注文", description="出展者向け弁当・ケータリングの注文書",
            recipient_org_id=orgs["catering"].id, is_required=False, sort_order=4,
        ),
        SubmissionCategory(
            id=uuid.uuid4(), exhibition_id=exhibition.id,
            name="備品レンタル", description="テーブル・椅子・ショーケース等の備品レンタル申込",
            recipient_org_id=orgs["decorator"].id, is_required=False, sort_order=5,
        ),
    ]
    db.add_all(cats)

    # Booths
    db.add_all([
        Booth(id=uuid.uuid4(), exhibition_id=exhibition.id, booth_number="A-01",
              exhibitor_id=orgs["exhibitor_a"].id, status="assigned"),
        Booth(id=uuid.uuid4(), exhibition_id=exhibition.id, booth_number="A-02",
              exhibitor_id=orgs["exhibitor_b"].id, status="assigned"),
        Booth(id=uuid.uuid4(), exhibition_id=exhibition.id, booth_number="A-03", status="vacant"),
    ])

    await db.commit()

    return {
        "message": "シードデータを投入しました",
        "exhibition_id": str(exhibition.id),
        "demo_users": [
            {"email": email, "password": password, "role": role}
            for email, password, role, _, _ in DEMO_USERS
        ],
    }
