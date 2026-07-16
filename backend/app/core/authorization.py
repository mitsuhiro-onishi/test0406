"""展示会・組織境界を一元化する認可ヘルパー。"""

import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booth import Booth
from app.models.exhibition import Exhibition
from app.models.submission_category import SubmissionCategory
from app.models.user import User


def accessible_exhibition_ids(user: User):
    """ユーザーが閲覧できる展示会IDのSELECTを返す。"""
    if user.role == "admin":
        return select(Exhibition.id)
    if user.role in ("organizer", "viewer"):
        return select(Exhibition.id).where(
            Exhibition.organizer_id == user.organization_id
        )
    if user.role == "exhibitor":
        return select(Booth.exhibition_id).where(
            Booth.exhibitor_id == user.organization_id
        )
    if user.role == "partner":
        return select(SubmissionCategory.exhibition_id).where(
            SubmissionCategory.recipient_org_id == user.organization_id
        )
    return select(Exhibition.id).where(False)


async def can_access_exhibition(
    db: AsyncSession,
    user: User,
    exhibition_id: uuid.UUID,
    *,
    write: bool = False,
) -> bool:
    """関係性に基づき展示会アクセスを判定する。"""
    if write and user.role not in ("admin", "organizer"):
        return False
    query = accessible_exhibition_ids(user).where(
        Exhibition.id == exhibition_id
        if user.role in ("admin", "organizer", "viewer")
        else (
            Booth.exhibition_id == exhibition_id
            if user.role == "exhibitor"
            else SubmissionCategory.exhibition_id == exhibition_id
        )
    )
    return (await db.execute(query.limit(1))).scalar_one_or_none() is not None


async def require_exhibition_access(
    db: AsyncSession,
    user: User,
    exhibition_id: uuid.UUID,
    *,
    write: bool = False,
) -> None:
    """存在有無を漏らさない404で展示会境界を強制する。"""
    if not await can_access_exhibition(db, user, exhibition_id, write=write):
        raise HTTPException(status_code=404, detail="展示会が見つかりません")
