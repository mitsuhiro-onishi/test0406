import uuid
from datetime import date, datetime

from sqlalchemy import String, Boolean, Date, ForeignKey, DateTime, func
from sqlalchemy import Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Exhibition(Base):
    __tablename__ = "exhibitions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    venue: Mapped[str | None] = mapped_column(String(200))
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    organizer_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("organizations.id"))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    document_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # 出展申込（セルフサービス）の受付。主催者がONにした展示会だけ公開フォームが有効になる
    accepting_applications: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    submission_categories = relationship("SubmissionCategory", back_populates="exhibition")
    booths = relationship("Booth", back_populates="exhibition")
