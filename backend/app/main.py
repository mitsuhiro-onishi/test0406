import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.database import engine, Base
from app.core.request_limits import RequestBodyLimitMiddleware
from app.core.schema_upgrades import apply_schema_upgrades
from app.api import admin_users, applications, auth, design_specs, documents, exhibitions, notifications, orders, reviews, seed


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables on startup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await apply_schema_upgrades(conn)

    from app.services.ai_queue import start_ai_queue, stop_ai_queue
    await start_ai_queue()

    # メール受信の常駐ポーリング（MAIL_INGEST_ENABLED=trueのときだけ・指示書04）
    mail_task = None
    if settings.mail_ingest_enabled:
        from app.services.mail_ingest import poll_loop
        mail_task = asyncio.create_task(poll_loop())

    yield

    if mail_task:
        mail_task.cancel()
        try:
            await mail_task
        except asyncio.CancelledError:
            pass
    await stop_ai_queue()


app = FastAPI(
    title="DOSL HUB - 展示会ドキュメント管理システム",
    description="Exhibition Document Management System API",
    version="0.2.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.enable_api_docs else None,
    redoc_url="/redoc" if settings.enable_api_docs else None,
    openapi_url="/openapi.json" if settings.enable_api_docs else None,
)


@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["Content-Security-Policy"] = "; ".join(
        (
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com",
            "img-src 'self' data: blob:",
            "connect-src 'self'",
            "frame-src 'self' blob:",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
        )
    )
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Strict-Transport-Security"] = (
        "max-age=31536000; includeSubDomains"
    )
    response.headers["Permissions-Policy"] = (
        "camera=(self), microphone=(), geolocation=(), payment=(), usb=()"
    )
    if request.url.path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-store")
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(
    RequestBodyLimitMiddleware,
    max_body_size=settings.max_request_size,
)

app.include_router(auth.router)
app.include_router(documents.router)
app.include_router(exhibitions.router)
app.include_router(reviews.router)
app.include_router(orders.router)
app.include_router(notifications.router)
app.include_router(applications.router)
app.include_router(admin_users.router)
app.include_router(design_specs.router)
app.include_router(seed.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# フロントエンド（web/ 配下の静的HTML）を同一サーバーから配信する
_web_root = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "web"))
if os.path.isdir(_web_root):
    app.mount("/", StaticFiles(directory=_web_root, html=True), name="web")
