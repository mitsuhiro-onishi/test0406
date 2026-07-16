"""AI解析結果（承認済み）から設計仕様レコードを生成・更新する"""
import logging
import uuid

from pydantic import ValidationError
from sqlalchemy import select

from app.models.ai_analysis import AIAnalysis
from app.models.design_spec import DesignSpec
from app.models.document import Document
from app.services.ai_result_schema import validate_ai_result


logger = logging.getLogger("design_spec_builder")


def _num(value) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


async def create_design_spec_from_analysis(db, document: Document, analysis: AIAnalysis) -> DesignSpec | None:
    """document_type=design かつ design_spec がある解析結果から DesignSpec を作る。

    同一ドキュメントの既存仕様がある場合は上書きし version を進める（再解析・再レビュー対応）。
    """
    if analysis.review_status != "reviewed":
        return None

    try:
        data = validate_ai_result(analysis.structured_data or {}).model_dump(
            mode="json"
        )
    except ValidationError:
        logger.warning("invalid reviewed AI result; design generation skipped")
        return None

    spec_data = data.get("design_spec")
    if data.get("document_type") != "design" or not isinstance(spec_data, dict):
        return None

    existing = (await db.execute(
        select(DesignSpec).where(DesignSpec.document_id == document.id)
    )).scalar_one_or_none()

    if existing:
        spec = existing
        spec.version = (existing.version or 1) + 1
        spec.status = "revised"
    else:
        spec = DesignSpec(id=uuid.uuid4(), document_id=document.id, version=1, status="confirmed")
        db.add(spec)

    spec.ai_analysis_id = analysis.id
    spec.exhibition_id = document.exhibition_id
    spec.booth_id = document.booth_id
    spec.width_mm = _num(spec_data.get("width_mm"))
    spec.depth_mm = _num(spec_data.get("depth_mm"))
    spec.height_mm = _num(spec_data.get("height_mm"))
    spec.materials = spec_data.get("materials") or []
    spec.electrical_requirements = spec_data.get("electrical_requirements")
    spec.structural_details = spec_data.get("structural_details")
    spec.special_requirements = spec_data.get("special_requirements")
    # 図面ファイル＝元ドキュメント自体（メール受信等で別添になったらそのパスを入れる）
    spec.floor_plan_storage_path = document.storage_path
    return spec
