"""ユーザー管理API（組織・ユーザーのCRUD）

主催者（admin/organizer）のみ利用可能。
- 組織: 作成・編集・削除（書類やユーザーが紐づく場合は削除不可）
- ユーザー: 作成（初期パスワード自動発行・一度だけ表示）・編集・無効化・パスワード再発行
"""
import re
import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import hash_password, require_manager
from app.services.audit import record_audit
from app.services.mail_sender import send_credentials_mail
from app.models.booth import Booth
from app.models.document import Document
from app.models.organization import Organization
from app.models.submission_category import SubmissionCategory
from app.models.user import User

router = APIRouter(prefix="/api", tags=["admin_users"])

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
VALID_ROLES = ("admin", "organizer", "exhibitor", "partner", "viewer")
VALID_ORG_TYPES = ("organizer", "decorator", "exhibitor", "partner")


class OrganizationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    org_type: str
    contact_email: str | None = Field(default=None, max_length=255)
    contact_phone: str | None = Field(default=None, max_length=20)


class OrganizationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    org_type: str | None = None
    contact_email: str | None = Field(default=None, max_length=255)
    contact_phone: str | None = Field(default=None, max_length=20)


class UserCreate(BaseModel):
    email: str = Field(max_length=255)
    name: str = Field(min_length=1, max_length=100)
    role: str
    organization_id: uuid.UUID


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    role: str | None = None
    organization_id: uuid.UUID | None = None
    is_active: bool | None = None


def _org_to_dict(o: Organization, user_count: int | None = None) -> dict:
    d = {
        "id": str(o.id),
        "name": o.name,
        "org_type": o.org_type,
        "contact_email": o.contact_email,
        "contact_phone": o.contact_phone,
        "created_at": o.created_at.isoformat() if o.created_at else None,
    }
    if user_count is not None:
        d["user_count"] = user_count
    return d


def _user_to_dict(u: User) -> dict:
    return {
        "id": str(u.id),
        "email": u.email,
        "name": u.name,
        "role": u.role,
        "is_active": u.is_active,
        "organization_id": str(u.organization_id),
        "organization_name": u.organization.name if u.organization else None,
        "created_at": u.created_at.isoformat() if u.created_at else None,
    }


# ──────────────── 組織 ────────────────
# 一覧(GET /organizations)は exhibitions.py の既存エンドポイントが担う
# （require_staff・user_count/連絡先込み。ここに定義すると二重登録になるため置かない）

@router.post("/organizations", status_code=201)
async def create_organization(
    body: OrganizationCreate,
    user: User = Depends(require_manager),
    db: AsyncSession = Depends(get_db),
):
    if body.org_type not in VALID_ORG_TYPES:
        raise HTTPException(status_code=400, detail=f"org_typeは {', '.join(VALID_ORG_TYPES)} のいずれかを指定してください")
    org = Organization(
        name=body.name.strip(),
        org_type=body.org_type,
        contact_email=(body.contact_email or "").strip() or None,
        contact_phone=(body.contact_phone or "").strip() or None,
    )
    db.add(org)
    await db.commit()
    return {"data": _org_to_dict(org, 0)}


@router.patch("/organizations/{org_id}")
async def update_organization(
    org_id: uuid.UUID,
    body: OrganizationUpdate,
    user: User = Depends(require_manager),
    db: AsyncSession = Depends(get_db),
):
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="組織が見つかりません")
    if body.org_type is not None:
        if body.org_type not in VALID_ORG_TYPES:
            raise HTTPException(status_code=400, detail=f"org_typeは {', '.join(VALID_ORG_TYPES)} のいずれかを指定してください")
        org.org_type = body.org_type
    if body.name is not None:
        org.name = body.name.strip()
    if body.contact_email is not None:
        org.contact_email = body.contact_email.strip() or None
    if body.contact_phone is not None:
        org.contact_phone = body.contact_phone.strip() or None
    await db.commit()
    return {"data": _org_to_dict(org)}


@router.delete("/organizations/{org_id}")
async def delete_organization(
    org_id: uuid.UUID,
    user: User = Depends(require_manager),
    db: AsyncSession = Depends(get_db),
):
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="組織が見つかりません")

    async def _count(stmt) -> int:
        return (await db.execute(stmt)).scalar() or 0

    users_n = await _count(select(func.count()).select_from(User).where(User.organization_id == org_id))
    docs_n = await _count(select(func.count()).select_from(Document).where(
        (Document.uploaded_by_org_id == org_id) | (Document.recipient_org_id == org_id)))
    booths_n = await _count(select(func.count()).select_from(Booth).where(Booth.exhibitor_id == org_id))
    cats_n = await _count(select(func.count()).select_from(SubmissionCategory).where(
        SubmissionCategory.recipient_org_id == org_id))

    reasons = []
    if users_n:
        reasons.append(f"ユーザー{users_n}名")
    if docs_n:
        reasons.append(f"書類{docs_n}件")
    if booths_n:
        reasons.append(f"ブース{booths_n}件")
    if cats_n:
        reasons.append(f"提出カテゴリ{cats_n}件")
    if reasons:
        raise HTTPException(
            status_code=409,
            detail=f"この組織には{('・'.join(reasons))}が紐づいているため削除できません。先に紐づけを解除してください",
        )

    record_audit(db, user, "organization_delete", "organization", org.id,
                 {"name": org.name, "org_type": org.org_type})
    await db.delete(org)
    await db.commit()
    return {"data": {"deleted": True}}


# ──────────────── ユーザー ────────────────

@router.get("/users")
async def list_users(
    organization_id: uuid.UUID | None = None,
    role: str | None = None,
    search: str | None = None,
    user: User = Depends(require_manager),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(User)
        .options(selectinload(User.organization))
        .order_by(User.created_at.asc())
    )
    if organization_id:
        query = query.where(User.organization_id == organization_id)
    if role:
        query = query.where(User.role == role)
    if search:
        s = f"%{search.strip()}%"
        query = query.where(User.name.ilike(s) | User.email.ilike(s))
    users = (await db.execute(query)).scalars().all()
    return {"data": [_user_to_dict(u) for u in users]}


@router.post("/users", status_code=201)
async def create_user(
    body: UserCreate,
    user: User = Depends(require_manager),
    db: AsyncSession = Depends(get_db),
):
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="メールアドレスの形式が正しくありません")
    if body.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"ロールは {', '.join(VALID_ROLES)} のいずれかを指定してください")

    org = await db.get(Organization, body.organization_id)
    if not org:
        raise HTTPException(status_code=404, detail="組織が見つかりません")

    existing = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="このメールアドレスは既に登録されています")

    initial_password = secrets.token_urlsafe(9)
    new_user = User(
        organization_id=org.id,
        email=email,
        name=body.name.strip(),
        hashed_password=hash_password(initial_password),
        role=body.role,
        is_active=True,
    )
    db.add(new_user)
    record_audit(db, user, "user_create", "user", new_user.id,
                 {"email": email, "role": body.role})
    await db.commit()
    await db.refresh(new_user, ["organization"])

    # メール送信基盤が有効なら初期パスワードをメールでも届ける（失敗しても作成は成功のまま）
    email_sent = await send_credentials_mail(email, new_user.name, initial_password)

    return {
        "data": {
            "user": _user_to_dict(new_user),
            "credentials": {
                "email": email,
                "initial_password": initial_password,
                "note": "初期パスワードはこの画面でのみ表示されます。本人へ安全な方法で伝えてください。",
            },
            "email_sent": email_sent,
        }
    }


@router.patch("/users/{user_id}")
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    user: User = Depends(require_manager),
    db: AsyncSession = Depends(get_db),
):
    target = (await db.execute(
        select(User).options(selectinload(User.organization)).where(User.id == user_id)
    )).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="ユーザーが見つかりません")

    is_self = target.id == user.id
    if is_self and body.role is not None and body.role != user.role:
        raise HTTPException(status_code=409, detail="自分自身のロールは変更できません")
    if is_self and body.is_active is False:
        raise HTTPException(status_code=409, detail="自分自身を無効化することはできません")

    if body.role is not None:
        if body.role not in VALID_ROLES:
            raise HTTPException(status_code=400, detail=f"ロールは {', '.join(VALID_ROLES)} のいずれかを指定してください")
        target.role = body.role
    if body.organization_id is not None:
        org = await db.get(Organization, body.organization_id)
        if not org:
            raise HTTPException(status_code=404, detail="組織が見つかりません")
        target.organization_id = org.id
    if body.name is not None:
        target.name = body.name.strip()
    if body.is_active is not None and body.is_active != target.is_active:
        record_audit(db, user, "user_activate" if body.is_active else "user_deactivate",
                     "user", target.id, {"email": target.email})
        target.is_active = body.is_active
    await db.commit()
    await db.refresh(target, ["organization"])
    return {"data": _user_to_dict(target)}


@router.post("/users/{user_id}/reset-password")
async def reset_password(
    user_id: uuid.UUID,
    user: User = Depends(require_manager),
    db: AsyncSession = Depends(get_db),
):
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="ユーザーが見つかりません")

    new_password = secrets.token_urlsafe(9)
    target.hashed_password = hash_password(new_password)
    record_audit(db, user, "user_reset_password", "user", target.id, {"email": target.email})
    await db.commit()

    email_sent = await send_credentials_mail(target.email, target.name, new_password, is_reset=True)

    return {
        "data": {
            "email": target.email,
            "new_password": new_password,
            "note": "新しいパスワードはこの画面でのみ表示されます。本人へ安全な方法で伝えてください。",
            "email_sent": email_sent,
        }
    }
