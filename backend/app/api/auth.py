from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import create_access_token, get_current_user, verify_password
from app.models.user import User

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class UserInfo(BaseModel):
    id: str
    email: str
    name: str
    role: str
    organization_id: str
    organization_name: str
    organization_type: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserInfo


def _user_info(user: User) -> UserInfo:
    return UserInfo(
        id=str(user.id),
        email=user.email,
        name=user.name,
        role=user.role,
        organization_id=str(user.organization_id),
        organization_name=user.organization.name if user.organization else "",
        organization_type=user.organization.org_type if user.organization else "",
    )


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User)
        .options(selectinload(User.organization))
        .where(User.email == body.email.strip().lower())
    )
    user = result.scalar_one_or_none()
    if user is None or not user.is_active or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="メールアドレスまたはパスワードが正しくありません")

    return LoginResponse(access_token=create_access_token(user), user=_user_info(user))


@router.get("/me", response_model=UserInfo)
async def me(user: User = Depends(get_current_user)):
    return _user_info(user)
