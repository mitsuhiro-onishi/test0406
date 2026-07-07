import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AIAnalysisSummary(BaseModel):
    id: uuid.UUID
    confidence_score: float
    review_status: str
    low_confidence_fields: list | None = None
    structured_data: dict | None = None
    llm_model: str | None = None
    processing_time_ms: int | None = None
    review_notes: str | None = None
    reviewed_at: datetime | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DocumentResponse(BaseModel):
    id: uuid.UUID
    exhibition_id: uuid.UUID
    submission_category_id: uuid.UUID
    submission_category_name: str | None = None
    recipient_org_name: str | None = None
    uploaded_by_org_name: str | None = None
    booth_id: uuid.UUID | None = None
    booth_number: str | None = None
    file_name: str
    file_type: str
    file_size_bytes: int
    source_channel: str
    document_category: str | None = None
    status: str
    confidence_score: float | None = None
    review_status: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DocumentDetailResponse(DocumentResponse):
    ai_analysis: AIAnalysisSummary | None = None


class DocumentListResponse(BaseModel):
    data: list[DocumentResponse]
    total: int


class SubmissionCategoryResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None = None
    recipient_org_id: uuid.UUID
    recipient_org_name: str | None = None
    is_required: bool
    deadline: datetime | None = None
    sort_order: int
    is_active: bool = True
    document_count: int = 0
    submitted_org_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class SubmissionCategoryCreate(BaseModel):
    name: str
    description: str | None = None
    recipient_org_id: uuid.UUID
    is_required: bool = True
    deadline: datetime | None = None
    sort_order: int = 0


class ExhibitionResponse(BaseModel):
    id: uuid.UUID
    name: str
    venue: str | None = None
    start_date: str
    end_date: str
    status: str
    document_deadline: datetime | None = None
    accepting_applications: bool = False

    model_config = ConfigDict(from_attributes=True)


class ReviewRequest(BaseModel):
    action: str  # approve / approve_with_corrections / reject
    corrected_data: dict | None = None
    notes: str | None = None
