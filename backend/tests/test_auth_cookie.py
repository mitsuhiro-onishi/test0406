"""JWTをJavaScriptから隔離するCookie認証の回帰テスト。"""

import pytest
from fastapi import Response

from app.api.auth import LoginRequest, login, logout
from app.core.database import Base, async_session, engine
from app.core.security import hash_password
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
