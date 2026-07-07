import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.database import engine, Base
from app.api import admin_users, applications, auth, design_specs, documents, exhibitions, notifications, orders, reviews, seed


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables on startup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(
    title="DOSL HUB - 展示会ドキュメント管理システム",
    description="Exhibition Document Management System API",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
