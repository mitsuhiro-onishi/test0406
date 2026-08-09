"""出展申込API

公開側: 認証なしで申込フォームの表示情報取得と申込送信ができる
管理側: 主催者が一覧・承認（組織/ユーザー/ブース自動作成）・却下を行う
"""
import re
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.authorization import require_exhibition_access
from app.core.security import hash_password, require_manager
from app.models.booth import Booth
from app.models.exhibition import Exhibition
from app.models.exhibitor_application import ExhibitorApplication
from app.models.notification import Notification
from app.models.organization import Organization
from app.models.user import User
from app.services.mail_sender import send_credentials_mail

router = APIRouter(prefix="/api", tags=["applications"])

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class ApplicationCreate(BaseModel):
    company_name: str = Field(min_length=1, max_length=200)
    contact_name: str = Field(min_length=1, max_length=100)
    email: str = Field(max_length=255)
    phone: str | None = Field(default=None, max_length=20)
    booth_count: int = Field(default=1, ge=1, le=50)
    message: str | None = Field(default=None, max_length=2000)


class ApplicationApprove(BaseModel):
    booth_number: str | None = Field(default=None, max_length=20)


class ApplicationReject(BaseModel):
    reason: str = Field(min_length=1, max_length=2000)


class ApplicationSettings(BaseModel):
    accepting_applications: bool


def _app_to_dict(a: ExhibitorApplication) -> dict:
    return {
        "id": str(a.id),
        "exhibition_id": str(a.exhibition_id),
        "company_name": a.company_name,
        "contact_name": a.contact_name,
        "email": a.email,
        "phone": a.phone,
        "booth_count": a.booth_count,
        "message": a.message,
        "status": a.status,
        "rejection_reason": a.rejection_reason,
        "created_organization_id": str(a.created_organization_id) if a.created_organization_id else None,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "reviewed_at": a.reviewed_at.isoformat() if a.reviewed_at else None,
    }


# ──────────────── 公開エンドポイント（認証なし） ────────────────

@router.get("/public/exhibitions/{exhibition_id}/application-info")
async def application_info(exhibition_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """申込フォーム表示用の展示会情報。受付停止中でも展示会名は返す"""
    ex = await db.get(Exhibition, exhibition_id)
    if not ex:
        raise HTTPException(status_code=404, detail="展示会が見つかりません")
    return {
        "data": {
            "id": str(ex.id),
            "name": ex.name,
            "venue": ex.venue,
            "start_date": str(ex.start_date),
            "end_date": str(ex.end_date),
            "accepting_applications": ex.accepting_applications,
        }
    }


@router.post("/public/exhibitions/{exhibition_id}/applications", status_code=201)
async def submit_application(
    exhibition_id: uuid.UUID,
    body: ApplicationCreate,
    db: AsyncSession = Depends(get_db),
):
    ex = await db.get(Exhibition, exhibition_id)
    if not ex:
        raise HTTPException(status_code=404, detail="展示会が見つかりません")
    if not ex.accepting_applications:
        raise HTTPException(status_code=403, detail="現在この展示会は出展申込を受け付けていません")

    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="メールアドレスの形式が正しくありません")

    # 同一展示会に同メールの審査中申込がある場合は重複とみなす
    dup = (await db.execute(
        select(func.count()).select_from(ExhibitorApplication).where(
            ExhibitorApplication.exhibition_id == exhibition_id,
            ExhibitorApplication.email == email,
            ExhibitorApplication.status == "pending",
        )
    )).scalar() or 0
    if dup:
        raise HTTPException(status_code=409, detail="このメールアドレスの申込は既に受け付けています。審査結果をお待ちください")

    # 既にアカウントが存在するメールは申込不可（承認時のユーザー作成が衝突するため）
    existing_user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if existing_user:
        raise HTTPException(status_code=409, detail="このメールアドレスは既に登録されています。ログインしてご利用ください")

    application = ExhibitorApplication(
        exhibition_id=exhibition_id,
        company_name=body.company_name.strip(),
        contact_name=body.contact_name.strip(),
        email=email,
        phone=(body.phone or "").strip() or None,
        booth_count=body.booth_count,
        message=(body.message or "").strip() or None,
    )
    db.add(application)
    await db.flush()

    # 主催者ユーザーに新着申込を通知
    organizers = (await db.execute(
        select(User).where(
            User.organization_id == ex.organizer_id,
            User.is_active.is_(True),
        )
    )).scalars().all()
    for u in organizers:
        db.add(Notification(
            user_id=u.id,
            type="application_received",
            title=f"出展申込: {application.company_name}",
            message=f"{ex.name} に新しい出展申込が届きました。",
            reference_type="exhibitor_application",
            reference_id=application.id,
        ))
    await db.commit()

    return {"data": {"id": str(application.id), "status": "pending"}}


# ──────────────── 管理側エンドポイント ────────────────

@router.get("/exhibitions/{exhibition_id}/applications")
async def list_applications(
    exhibition_id: uuid.UUID,
    status: str | None = None,
    user: User = Depends(require_manager),
    db: AsyncSession = Depends(get_db),
):
    await require_exhibition_access(db, user, exhibition_id, write=True)
    query = (
        select(ExhibitorApplication)
        .where(ExhibitorApplication.exhibition_id == exhibition_id)
        .order_by(ExhibitorApplication.created_at.desc())
    )
    if status:
        query = query.where(ExhibitorApplication.status == status)
    apps = (await db.execute(query)).scalars().all()
    pending = sum(1 for a in apps if a.status == "pending") if status is None else None
    return {"data": [_app_to_dict(a) for a in apps], "pending_count": pending}


@router.post("/applications/{application_id}/approve")
async def approve_application(
    application_id: uuid.UUID,
    body: ApplicationApprove,
    user: User = Depends(require_manager),
    db: AsyncSession = Depends(get_db),
):
    """承認: 出展社組織＋担当者アカウント＋ブースを作成する。

    ブース番号は必須。出展社の展示会アクセス権はブース割当経由でしか
    付与されないため、ブースなしで承認すると発行アカウントは
    「参加中の展示会がありません」となり何もできない。
    初期パスワードはこのレスポンスで一度だけ返す（メール送信はPhase 2）。
    """
    application = await db.get(ExhibitorApplication, application_id)
    if not application:
        raise HTTPException(status_code=404, detail="申込が見つかりません")
    await require_exhibition_access(
        db, user, application.exhibition_id, write=True
    )
    if application.status != "pending":
        raise HTTPException(status_code=409, detail="この申込は既に処理済みです")

    existing_user = (await db.execute(select(User).where(User.email == application.email))).scalar_one_or_none()
    if existing_user:
        raise HTTPException(status_code=409, detail="このメールアドレスのユーザーが既に存在します")

    booth_number = (body.booth_number or "").strip() or None
    if not booth_number:
        raise HTTPException(
            status_code=400,
            detail="ブース番号を入力してください（ブース割当がないと出展社アカウントは展示会にアクセスできません）",
        )
    if booth_number:
        dup_booth = (await db.execute(
            select(func.count()).select_from(Booth).where(
                Booth.exhibition_id == application.exhibition_id,
                Booth.booth_number == booth_number,
            )
        )).scalar() or 0
        if dup_booth:
            raise HTTPException(status_code=409, detail=f"ブース番号 {booth_number} は既に使われています")

    org = Organization(
        name=application.company_name,
        org_type="exhibitor",
        contact_email=application.email,
        contact_phone=application.phone,
    )
    db.add(org)
    await db.flush()

    initial_password = secrets.token_urlsafe(9)
    account = User(
        organization_id=org.id,
        email=application.email,
        name=application.contact_name,
        hashed_password=hash_password(initial_password),
        role="exhibitor",
    )
    db.add(account)

    if booth_number:
        db.add(Booth(
            exhibition_id=application.exhibition_id,
            booth_number=booth_number,
            exhibitor_id=org.id,
            status="assigned",
        ))

    application.status = "approved"
    application.created_organization_id = org.id
    application.reviewed_by = user.id
    application.reviewed_at = datetime.now(timezone.utc)
    await db.commit()

    # メール送信基盤が有効なら初期パスワードをメールでも届ける（失敗しても承認は成功のまま）
    email_sent = await send_credentials_mail(application.email, application.contact_name, initial_password)

    return {
        "data": {
            "application": _app_to_dict(application),
            "credentials": {
                "email": application.email,
                "initial_password": initial_password,
                "note": "初期パスワードはこの画面でのみ表示されます。出展社へ安全な方法で伝えてください。",
            },
            "booth_number": booth_number,
            "email_sent": email_sent,
        }
    }


@router.post("/applications/{application_id}/reject")
async def reject_application(
    application_id: uuid.UUID,
    body: ApplicationReject,
    user: User = Depends(require_manager),
    db: AsyncSession = Depends(get_db),
):
    application = await db.get(ExhibitorApplication, application_id)
    if not application:
        raise HTTPException(status_code=404, detail="申込が見つかりません")
    await require_exhibition_access(
        db, user, application.exhibition_id, write=True
    )
    if application.status != "pending":
        raise HTTPException(status_code=409, detail="この申込は既に処理済みです")

    application.status = "rejected"
    application.rejection_reason = body.reason.strip()
    application.reviewed_by = user.id
    application.reviewed_at = datetime.now(timezone.utc)
    await db.commit()
    return {"data": _app_to_dict(application)}


@router.patch("/exhibitions/{exhibition_id}/application-settings")
async def update_application_settings(
    exhibition_id: uuid.UUID,
    body: ApplicationSettings,
    user: User = Depends(require_manager),
    db: AsyncSession = Depends(get_db),
):
    await require_exhibition_access(db, user, exhibition_id, write=True)
    ex = await db.get(Exhibition, exhibition_id)
    if not ex:
        raise HTTPException(status_code=404, detail="展示会が見つかりません")
    ex.accepting_applications = body.accepting_applications
    await db.commit()
    return {"data": {"accepting_applications": ex.accepting_applications}}
