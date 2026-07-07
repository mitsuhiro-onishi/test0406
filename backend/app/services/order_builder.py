"""AI解析結果（承認済み）から注文レコードを生成する"""
import uuid
from datetime import date

from sqlalchemy import delete, select

from app.models.ai_analysis import AIAnalysis
from app.models.document import Document
from app.models.order import Order, OrderItem


def _parse_date(value) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _num(value) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


async def create_order_from_analysis(db, document: Document, analysis: AIAnalysis) -> Order | None:
    """document_type=order の解析結果から Order/OrderItem を作る。

    同一ドキュメントの既存注文は削除して作り直す（再解析・再レビュー対応）。
    """
    data = analysis.structured_data or {}
    items = data.get("order_items") or []
    if data.get("document_type") != "order" or not items:
        return None

    existing_ids = (await db.execute(
        select(Order.id).where(Order.document_id == document.id)
    )).scalars().all()
    if existing_ids:
        await db.execute(delete(OrderItem).where(OrderItem.order_id.in_(existing_ids)))
        await db.execute(delete(Order).where(Order.id.in_(existing_ids)))

    order = Order(
        id=uuid.uuid4(),
        document_id=document.id,
        ai_analysis_id=analysis.id,
        exhibition_id=document.exhibition_id,
        booth_id=document.booth_id,
        exhibitor_id=document.uploaded_by_org_id,
        delivery_date=_parse_date(data.get("delivery_date")),
        total_amount=_num(data.get("total_amount")),
        special_instructions=data.get("special_instructions"),
        status="confirmed",
    )
    db.add(order)

    for i, item in enumerate(items):
        if not item.get("item_name"):
            continue
        db.add(OrderItem(
            order_id=order.id,
            item_name=str(item["item_name"])[:300],
            item_category=item.get("item_category"),
            quantity=_num(item.get("quantity")) or 0,
            unit=item.get("unit"),
            unit_price=_num(item.get("unit_price")),
            total_price=_num(item.get("total_price")),
            sort_order=i,
        ))
    return order
