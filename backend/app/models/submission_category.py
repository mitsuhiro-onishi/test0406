import uuid
from datetime import datetime

from sqlalchemy import String, Boolean, Integer, ForeignKey, DateTime, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class SubmissionCategory(Base):
    __tablename__ = "submission_categories"
    __table_args__ = (
        UniqueConstraint("exhibition_id", "name", name="uq_submission_category_exhibition_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    exhibition_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("exhibitions.id"))
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    recipient_org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"))
    is_required: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    exhibition = relationship("Exhibition", back_populates="submission_categories")
    recipient_org = relationship("Organization", foreign_keys=[recipient_org_id])
    documents = relationship("Document", back_populates="submission_category")
