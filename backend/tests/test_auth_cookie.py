"""JWTをJavaScriptから隔離するCookie認証の回帰テスト。"""

import pytest
from fastapi import HTTPException, Request, Response
from sqlalchemy import select

from app.api.auth import LoginRequest, login, logout
from app.core.database import Base, async_session, engine
from app.core.security import create_access_token, get_current_user, hash_password
from app.api.admin_users import reset_password
from app.models.organization import Organization
from app.models.user import User


@pytest.fixture()
async def login_database():
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)

    async with async_session() as database:
        organization = Organization(name="主催者", org_type="organizer")
        database.add(organization)
        await database.flush()
        database.add(
            User(
                organization_id=organization.id,
                email="admin@example.com",
                name="管理者",
                hashed_password=hash_password("correct-password"),
                role="admin",
            )
        )
        await database.commit()
        yield database


async def test_login_sets_hardened_httponly_cookie_without_returning_jwt(login_database):
    response = Response()
    result = await login(
        LoginRequest(email="admin@example.com", password="correct-password"),
        response,
        Request({"type": "http", "client": ("127.0.0.1", 1234), "headers": []}),
        login_database,
    )

    assert result.user.email == "admin@example.com"
    assert not hasattr(result, "access_token")
    cookie = response.headers["set-cookie"].lower()
    assert "doslhub_session=" in cookie
    assert "httponly" in cookie
    assert "secure" in cookie
    assert "samesite=strict" in cookie
    assert "path=/" in cookie


async def test_logout_expires_session_cookie():
    response = Response()
    await logout(response)
    cookie = response.headers["set-cookie"].lower()
    assert "doslhub_session=" in cookie
    assert "max-age=0" in cookie
    assert "httponly" in cookie


async def test_login_attempts_are_database_rate_limited(login_database, monkeypatch):
    from app.api import auth

    monkeypatch.setattr(auth.settings, "login_attempts_per_account_15m", 1)
    request = Request(
        {"type": "http", "client": ("192.0.2.10", 1234), "headers": []}
    )
    await login(
        LoginRequest(email="admin@example.com", password="correct-password"),
        Response(),
        request,
        login_database,
    )
    with pytest.raises(HTTPException) as error:
        await login(
            LoginRequest(email="admin@example.com", password="correct-password"),
            Response(),
            request,
            login_database,
        )

    assert error.value.status_code == 429
    assert error.value.headers["Retry-After"] == "900"


async def test_password_reset_immediately_revokes_existing_cookie(login_database, monkeypatch):
    user = (
        await login_database.execute(
            select(User).where(User.email == "admin@example.com")
        )
    ).scalar_one()
    old_token = create_access_token(user)

    async def fake_send(*_args, **_kwargs):
        return True

    monkeypatch.setattr("app.api.admin_users.send_credentials_mail", fake_send)
    await reset_password(user.id, user, login_database)

    request = Request(
        {
            "type": "http",
            "headers": [(b"cookie", f"doslhub_session={old_token}".encode())],
        }
    )
    with pytest.raises(HTTPException) as error:
        await get_current_user(request, login_database)
    assert error.value.status_code == 401
