import uuid
from datetime import datetime

from sqlalchemy import String, ForeignKey, DateTime, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Booth(Base):
    __tablename__ = "booths"
    __table_args__ = (
        UniqueConstraint("exhibition_id", "booth_number", name="uq_booth_exhibition_number"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    exhibition_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("exhibitions.id"))
    booth_number: Mapped[str] = mapped_column(String(20), nullable=False)
    exhibitor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="vacant")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    exhibition = relationship("Exhibition", back_populates="booths")
    exhibitor = relationship("Organization", foreign_keys=[exhibitor_id])
