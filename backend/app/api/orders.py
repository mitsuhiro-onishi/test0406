import csv
import io
import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import get_current_user, require_staff
from app.models.order import Order, OrderItem
from app.models.user import User

router = APIRouter(prefix="/api/orders", tags=["orders"])

ORDER_LOAD_OPTIONS = (
    selectinload(Order.items),
    selectinload(Order.exhibitor),
    selectinload(Order.booth),
    selectinload(Order.document),
)


def apply_order_role_filter(query, user: User):
    if user.role == "exhibitor":
        return query.where(Order.exhibitor_id == user.organization_id)
    if user.role == "partner":
        from app.models.document import Document
        return query.join(Document, Order.document_id == Document.id).where(
            Document.recipient_org_id == user.organization_id
        )
    return query


def order_to_dict(o: Order) -> dict:
    return {
        "id": str(o.id),
        "document_id": str(o.document_id),
        "exhibition_id": str(o.exhibition_id),
        "exhibitor_name": o.exhibitor.name if o.exhibitor else None,
        "booth_number": o.booth.booth_number if o.booth else None,
        "file_name": o.document.file_name if o.document else None,
        "order_date": o.order_date.isoformat() if o.order_date else None,
        "delivery_date": o.delivery_date.isoformat() if o.delivery_date else None,
        "total_amount": float(o.total_amount) if o.total_amount is not None else None,
        "special_instructions": o.special_instructions,
        "status": o.status,
        "created_at": o.created_at.isoformat(),
        "items": [
            {
                "item_name": i.item_name,
                "item_category": i.item_category,
                "quantity": float(i.quantity),
                "unit": i.unit,
                "unit_price": float(i.unit_price) if i.unit_price is not None else None,
                "total_price": float(i.total_price) if i.total_price is not None else None,
            }
            for i in o.items
        ],
    }


@router.get("")
async def list_orders(
    exhibition_id: uuid.UUID | None = None,
    limit: int = 50,
    offset: int = 0,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Order).options(*ORDER_LOAD_OPTIONS)
    query = apply_order_role_filter(query, user)
    if exhibition_id:
        query = query.where(Order.exhibition_id == exhibition_id)

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar() or 0
    query = query.order_by(Order.created_at.desc()).limit(min(limit, 100)).offset(offset)
    orders = (await db.execute(query)).scalars().all()
    return {"data": [order_to_dict(o) for o in orders], "total": total}


@router.get("/summary")
async def orders_summary(
    exhibition_id: uuid.UUID | None = None,
    user: User = Depends(require_staff),
    db: AsyncSession = Depends(get_db),
):
    query = select(Order).options(*ORDER_LOAD_OPTIONS)
    query = apply_order_role_filter(query, user)
    if exhibition_id:
        query = query.where(Order.exhibition_id == exhibition_id)
    orders = (await db.execute(query)).scalars().all()

    total_amount = sum(float(o.total_amount or 0) for o in orders)
    by_exhibitor: dict[str, dict] = {}
    for o in orders:
        key = o.exhibitor.name if o.exhibitor else "不明"
        agg = by_exhibitor.setdefault(key, {
            "exhibitor_name": key,
            "booth": o.booth.booth_number if o.booth else None,
            "count": 0, "amount": 0.0,
        })
        agg["count"] += 1
        agg["amount"] += float(o.total_amount or 0)

    return {
        "data": {
            "total_orders": len(orders),
            "total_amount": total_amount,
            "by_exhibitor": sorted(by_exhibitor.values(), key=lambda x: -x["amount"]),
        }
    }


@router.get("/export.csv")
async def export_orders_csv(
    exhibition_id: uuid.UUID | None = None,
    user: User = Depends(require_staff),
    db: AsyncSession = Depends(get_db),
):
    query = select(Order).options(*ORDER_LOAD_OPTIONS)
    query = apply_order_role_filter(query, user)
    if exhibition_id:
        query = query.where(Order.exhibition_id == exhibition_id)
    orders = (await db.execute(query.order_by(Order.created_at))).scalars().all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "注文ID", "出展社", "ブース", "元ファイル", "品目名", "数量", "単位",
        "単価", "金額", "希望納期", "特記事項", "ステータス", "受信日時",
    ])
    for o in orders:
        base = [
            str(o.id),
            o.exhibitor.name if o.exhibitor else "",
            o.booth.booth_number if o.booth else "",
            o.document.file_name if o.document else "",
        ]
        tail = [
            o.delivery_date.isoformat() if o.delivery_date else "",
            o.special_instructions or "",
            o.status,
            o.created_at.isoformat(),
        ]
        if o.items:
            for i in o.items:
                writer.writerow(base + [
                    i.item_name,
                    float(i.quantity),
                    i.unit or "",
                    float(i.unit_price) if i.unit_price is not None else "",
                    float(i.total_price) if i.total_price is not None else "",
                ] + tail)
        else:
            writer.writerow(base + ["", "", "", "", float(o.total_amount or 0)] + tail)

    # ExcelでのUTF-8文字化け防止のためBOM付き
    data = "\ufeff" + buf.getvalue()
    return StreamingResponse(
        io.BytesIO(data.encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=orders.csv"},
    )
