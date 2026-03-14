import uuid
from datetime import datetime

from pydantic import BaseModel


class DocumentResponse(BaseModel):
    id: uuid.UUID
    exhibition_id: uuid.UUID
    submission_category_id: uuid.UUID
    submission_category_name: str | None = None
    recipient_org_name: str | None = None
    booth_id: uuid.UUID | None = None
    file_name: str
    file_type: str
    file_size_bytes: int
    source_channel: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


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
    sort_order: int

    class Config:
        from_attributes = True


class ExhibitionResponse(BaseModel):
    id: uuid.UUID
    name: str
    venue: str | None = None
    start_date: str
    end_date: str
    status: str

    class Config:
        from_attributes = True
