import uuid
from datetime import datetime

from sqlalchemy import String, Integer, Text, ForeignKey, DateTime, func
from sqlalchemy import Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ExhibitorApplication(Base):
    """出展申込（アカウント発行前のセルフサービス申込）

    承認されると organization / user / booth が作成され、
    created_organization_id で紐づく。以降は既存の書類提出フローに乗る。
    """
    __tablename__ = "exhibitor_applications"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    exhibition_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("exhibitions.id"), nullable=False)
    company_name: Mapped[str] = mapped_column(String(200), nullable=False)
    contact_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(20))
    booth_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    message: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")  # pending / approved / rejected
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    created_organization_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("organizations.id"))
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    exhibition = relationship("Exhibition")
    created_organization = relationship("Organization", foreign_keys=[created_organization_id])
