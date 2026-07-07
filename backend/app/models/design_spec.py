import uuid
from datetime import datetime

from sqlalchemy import String, Integer, Numeric, ForeignKey, DateTime, Text, JSON, func
from sqlalchemy import Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class DesignSpec(Base):
    """ブース設営書類のAI解析から確定した設計仕様データ（設計docs 2.11）"""
    __tablename__ = "design_specs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("documents.id"))
    ai_analysis_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("ai_analyses.id"))
    exhibition_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("exhibitions.id"))
    booth_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("booths.id"))
    width_mm: Mapped[float | None] = mapped_column(Numeric(10, 2))
    depth_mm: Mapped[float | None] = mapped_column(Numeric(10, 2))
    height_mm: Mapped[float | None] = mapped_column(Numeric(10, 2))
    materials: Mapped[list | None] = mapped_column(JSON)
    electrical_requirements: Mapped[dict | None] = mapped_column(JSON)
    structural_details: Mapped[str | None] = mapped_column(Text)
    special_requirements: Mapped[str | None] = mapped_column(Text)
    floor_plan_storage_path: Mapped[str | None] = mapped_column(String(1000))
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # draft / confirmed / revised
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    document = relationship("Document", foreign_keys=[document_id])
    booth = relationship("Booth", foreign_keys=[booth_id])
