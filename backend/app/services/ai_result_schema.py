"""未信頼なAI解析結果の検証と、人手レビュー強制ポリシー。"""

from dataclasses import dataclass
from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


ShortText = Annotated[str, Field(max_length=200)]
LongText = Annotated[str, Field(max_length=2000)]
NonNegativeAmount = Annotated[
    float,
    Field(ge=0, le=9_999_999_999.99, allow_inf_nan=False),
]
NonNegativeQuantity = Annotated[
    float,
    Field(ge=0, le=1_000_000, allow_inf_nan=False),
]
DimensionMm = Annotated[
    float,
    Field(gt=0, le=100_000, allow_inf_nan=False),
]
Confidence = Annotated[
    float,
    Field(ge=0, le=1, allow_inf_nan=False),
]


class StrictAIModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        strict=True,
        str_strip_whitespace=True,
    )


class OrderItemResult(StrictAIModel):
    item_name: Annotated[str, Field(min_length=1, max_length=300)]
    item_category: Annotated[str, Field(max_length=100)] | None = None
    quantity: NonNegativeQuantity
    unit: Annotated[str, Field(max_length=20)] | None = None
    unit_price: NonNegativeAmount | None = None
    total_price: NonNegativeAmount | None = None


class MaterialResult(StrictAIModel):
    name: ShortText
    specification: Annotated[str, Field(max_length=500)] | None = None
    color: ShortText | None = None
    area: ShortText | None = None


class ElectricalRequirementsResult(StrictAIModel):
    power_kw: Annotated[
        float,
        Field(ge=0, le=10_000, allow_inf_nan=False),
    ] | None = None
    outlet_count: Annotated[int, Field(ge=0, le=10_000)] | None = None
    lighting: Annotated[str, Field(max_length=1000)] | None = None


class DesignSpecResult(StrictAIModel):
    width_mm: DimensionMm | None = None
    depth_mm: DimensionMm | None = None
    height_mm: DimensionMm | None = None
    materials: Annotated[list[MaterialResult], Field(max_length=100)] = Field(
        default_factory=list
    )
    electrical_requirements: ElectricalRequirementsResult | None = None
    structural_details: LongText | None = None
    special_requirements: LongText | None = None


class FieldConfidenceResult(StrictAIModel):
    order_items: Confidence = 0.0
    total_amount: Confidence = 0.0
    detected_company_name: Confidence = 0.0
    delivery_date: Confidence = 0.0
    design_spec: Confidence = 0.0


class AIResult(StrictAIModel):
    document_type: Literal["order", "design", "contract", "other"]
    detected_company_name: ShortText | None = None
    detected_booth_number: Annotated[str, Field(max_length=100)] | None = None
    summary: Annotated[str, Field(max_length=1000)]
    order_items: Annotated[list[OrderItemResult], Field(max_length=100)] = Field(
        default_factory=list
    )
    total_amount: NonNegativeAmount | None = None
    delivery_date: str | None = None
    special_instructions: LongText | None = None
    design_spec: DesignSpecResult | None = None
    extracted_text: LongText
    field_confidence: FieldConfidenceResult
    overall_confidence: Confidence
    extraction_notes: LongText

    @field_validator("delivery_date")
    @classmethod
    def validate_delivery_date(cls, value: str | None) -> str | None:
        if value is None:
            return None
        date.fromisoformat(value)
        return value

    @model_validator(mode="after")
    def validate_document_specific_fields(self):
        if self.document_type != "order" and self.order_items:
            raise ValueError("order以外のorder_itemsは空配列である必要があります")
        if self.document_type != "design" and self.design_spec is not None:
            raise ValueError("design以外のdesign_specはnullである必要があります")
        return self


@dataclass(frozen=True)
class AIReviewDecision:
    structured_data: dict
    extracted_text: str
    confidence: float
    low_confidence_fields: list[str]
    review_status: Literal["pending_review"] = "pending_review"
    document_status: Literal["review_needed"] = "review_needed"


def validate_ai_result(data: object) -> AIResult:
    """AIが返したオブジェクトを業務上限付きスキーマで検証する。"""
    return AIResult.model_validate(data)


def evaluate_ai_result(data: object) -> AIReviewDecision:
    """有効なAI結果を、信頼度に関係なく必ず人手レビューへ送る。"""
    result = validate_ai_result(data)
    field_confidence = result.field_confidence.model_dump()
    return AIReviewDecision(
        structured_data=result.model_dump(mode="json"),
        extracted_text=result.extracted_text,
        confidence=result.overall_confidence,
        low_confidence_fields=[
            key for key, value in field_confidence.items() if value < 0.8
        ],
    )
