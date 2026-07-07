import uuid
from datetime import date, datetime

from sqlalchemy import String, Integer, Numeric, Date, ForeignKey, DateTime, Text, JSON, func
from sqlalchemy import Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("documents.id"))
    ai_analysis_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("ai_analyses.id"))
    exhibition_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("exhibitions.id"))
    booth_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("booths.id"))
    exhibitor_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("organizations.id"))
    order_date: Mapped[date | None] = mapped_column(Date)
    delivery_date: Mapped[date | None] = mapped_column(Date)
    total_amount: Mapped[float | None] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3), default="JPY")
    special_instructions: Mapped[str | None] = mapped_column(Text)
    # draft / confirmed / in_progress / completed / cancelled
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="confirmed")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    items = relationship("OrderItem", back_populates="order", order_by="OrderItem.sort_order")
    exhibitor = relationship("Organization", foreign_keys=[exhibitor_id])
    booth = relationship("Booth", foreign_keys=[booth_id])
    document = relationship("Document", foreign_keys=[document_id])


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("orders.id"))
    item_name: Mapped[str] = mapped_column(String(300), nullable=False)
    item_category: Mapped[str | None] = mapped_column(String(100))
    quantity: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    unit: Mapped[str | None] = mapped_column(String(20))
    unit_price: Mapped[float | None] = mapped_column(Numeric(12, 2))
    total_price: Mapped[float | None] = mapped_column(Numeric(12, 2))
    specifications: Mapped[dict | None] = mapped_column(JSON)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    order = relationship("Order", back_populates="items")
