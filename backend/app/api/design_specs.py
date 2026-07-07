"""設計仕様API（設計docs 03_api_design.md §11）

ブース設営書類のAI解析から生成された設計仕様の一覧・詳細・修正。
partner（協力会社）は自社宛カテゴリの書類由来の仕様のみ閲覧できる。
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import require_manager, require_staff
from app.models.design_spec import DesignSpec
from app.models.document import Document
from app.models.user import User

router = APIRouter(prefix="/api", tags=["design_specs"])


class DesignSpecUpdate(BaseModel):
    width_mm: float | None = Field(default=None, ge=0)
    depth_mm: float | None = Field(default=None, ge=0)
    height_mm: float | None = Field(default=None, ge=0)
    materials: list | None = None
    electrical_requirements: dict | None = None
    structural_details: str | None = None
    special_requirements: str | None = None
    status: str | None = None  # draft / confirmed / revised


def _num(v):
    return float(v) if v is not None else None


def _spec_to_dict(s: DesignSpec, detail: bool = False) -> dict:
    doc = s.document
    d = {
        "id": str(s.id),
        "document_id": str(s.document_id),
        "exhibition_id": str(s.exhibition_id),
        "booth_number": s.booth.booth_number if s.booth else None,
        "exhibitor_org_name": doc.uploaded_by_org.name if doc and doc.uploaded_by_org else None,
        "file_name": doc.file_name if doc else None,
        "width_mm": _num(s.width_mm),
        "depth_mm": _num(s.depth_mm),
        "height_mm": _num(s.height_mm),
        "materials": s.materials or [],
        "electrical_requirements": s.electrical_requirements,
        "version": s.version,
        "status": s.status,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
    }
    if detail:
        d.update({
            "structural_details": s.structural_details,
            "special_requirements": s.special_requirements,
        })
    return d


def _base_query(user: User):
    query = (
        select(DesignSpec)
        .join(Document, DesignSpec.document_id == Document.id)
        .options(
            selectinload(DesignSpec.booth),
            selectinload(DesignSpec.document).selectinload(Document.uploaded_by_org),
        )
        .where(Document.is_deleted.is_(False))
    )
    if user.role == "partner":
        query = query.where(Document.recipient_org_id == user.organization_id)
    return query


@router.get("/design-specs")
async def list_design_specs(
    exhibition_id: uuid.UUID | None = None,
    status: str | None = None,
    user: User = Depends(require_staff),
    db: AsyncSession = Depends(get_db),
):
    query = _base_query(user).order_by(DesignSpec.updated_at.desc())
    if exhibition_id:
        query = query.where(DesignSpec.exhibition_id == exhibition_id)
    if status:
        query = query.where(DesignSpec.status == status)
    specs = (await db.execute(query)).scalars().all()
    return {"data": [_spec_to_dict(s) for s in specs]}


@router.get("/design-specs/{spec_id}")
async def get_design_spec(
    spec_id: uuid.UUID,
    user: User = Depends(require_staff),
    db: AsyncSession = Depends(get_db),
):
    spec = (await db.execute(
        _base_query(user).where(DesignSpec.id == spec_id)
    )).scalar_one_or_none()
    if not spec:
        raise HTTPException(status_code=404, detail="設計仕様が見つかりません")
    return {"data": _spec_to_dict(spec, detail=True)}


@router.put("/design-specs/{spec_id}")
async def update_design_spec(
    spec_id: uuid.UUID,
    body: DesignSpecUpdate,
    user: User = Depends(require_manager),
    db: AsyncSession = Depends(get_db),
):
    spec = (await db.execute(
        _base_query(user).where(DesignSpec.id == spec_id)
    )).scalar_one_or_none()
    if not spec:
        raise HTTPException(status_code=404, detail="設計仕様が見つかりません")

    # 送られてきたフィールドだけ更新する（明示的なnullはクリアとして扱う）
    payload = body.model_dump(exclude_unset=True)

    if "status" in payload and payload["status"] is not None:
        if payload["status"] not in ("draft", "confirmed", "revised"):
            raise HTTPException(status_code=400, detail="statusはdraft/confirmed/revisedのいずれかです")
        spec.status = payload["status"]

    changed = False
    for field in ("width_mm", "depth_mm", "height_mm", "materials",
                  "electrical_requirements", "structural_details", "special_requirements"):
        if field in payload and getattr(spec, field) != payload[field]:
            setattr(spec, field, payload[field])
            changed = True
    if changed:
        spec.version = (spec.version or 1) + 1
        if payload.get("status") is None:
            spec.status = "revised"

    await db.commit()
    await db.refresh(spec)
    return {"data": _spec_to_dict(spec, detail=True)}
