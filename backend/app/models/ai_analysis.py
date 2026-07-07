import uuid
from datetime import datetime

from sqlalchemy import String, Integer, Numeric, ForeignKey, DateTime, Text, JSON, func
from sqlalchemy import Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class AIAnalysis(Base):
    __tablename__ = "ai_analyses"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("documents.id"))
    extracted_text: Mapped[str | None] = mapped_column(Text)
    structured_data: Mapped[dict] = mapped_column(JSON, nullable=False)
    confidence_score: Mapped[float] = mapped_column(Numeric(3, 2), nullable=False)
    low_confidence_fields: Mapped[list | None] = mapped_column(JSON)
    llm_model: Mapped[str | None] = mapped_column(String(100))
    llm_prompt_tokens: Mapped[int | None] = mapped_column(Integer)
    llm_completion_tokens: Mapped[int | None] = mapped_column(Integer)
    processing_time_ms: Mapped[int | None] = mapped_column(Integer)
    # auto_approved / pending_review / reviewed / rejected
    review_status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending_review")
    reviewed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    review_notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    document = relationship("Document", back_populates="ai_analyses")
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_user_id])
