from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.config import settings
from app.core.security import create_access_token, get_current_user, verify_password
from app.models.user import User
from app.services.quota import QuotaExceeded, consume_quota, fixed_window

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
async def login(
    body: LoginRequest,
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    email = body.email.strip().lower()
    client_ip = request.client.host if request.client else "unknown"
    window = fixed_window(15 * 60)
    try:
        await consume_quota(
            db,
            action="login_account_15m",
            identity=email,
            window=window,
            max_count=settings.login_attempts_per_account_15m,
        )
        await consume_quota(
            db,
            action="login_ip_15m",
            identity=client_ip,
            window=window,
            max_count=settings.login_attempts_per_ip_15m,
        )
    except QuotaExceeded:
        raise HTTPException(
            status_code=429,
            detail="ログイン試行回数が上限に達しました。しばらく待ってから再試行してください",
            headers={"Retry-After": "900"},
        )

    result = await db.execute(
        select(User)
        .options(selectinload(User.organization))
        .where(User.email == email)
    )
    user = result.scalar_one_or_none()
    if user is None or not user.is_active or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="メールアドレスまたはパスワードが正しくありません")

    response.set_cookie(
        key=settings.auth_cookie_name,
        value=create_access_token(user),
        max_age=settings.jwt_expire_minutes * 60,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite="strict",
        path="/",
    )
    response.headers["Cache-Control"] = "no-store"
    return LoginResponse(user=_user_info(user))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response):
    response.delete_cookie(
        key=settings.auth_cookie_name,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite="strict",
        path="/",
    )
    response.headers["Cache-Control"] = "no-store"


@router.get("/me", response_model=UserInfo)
async def me(user: User = Depends(get_current_user)):
    return _user_info(user)
