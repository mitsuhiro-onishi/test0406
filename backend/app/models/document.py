import uuid
from datetime import datetime

from sqlalchemy import String, BigInteger, ForeignKey, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    exhibition_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("exhibitions.id"))
    submission_category_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("submission_categories.id"))
    booth_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("booths.id"))
    uploaded_by_org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"))
    uploaded_by_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    recipient_org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"))
    file_name: Mapped[str] = mapped_column(String(500), nullable=False)
    file_type: Mapped[str] = mapped_column(String(50), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    source_channel: Mapped[str] = mapped_column(String(20), nullable=False, default="web_upload")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="received")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    submission_category = relationship("SubmissionCategory", back_populates="documents")
    uploaded_by_org = relationship("Organization", foreign_keys=[uploaded_by_org_id])
    recipient_org = relationship("Organization", foreign_keys=[recipient_org_id])
    uploaded_by_user = relationship("User", foreign_keys=[uploaded_by_user_id])
