"""監査ログ（audit_logs）の記録ヘルパー

主要操作のみ記録する（全操作の網羅はしない）:
- レビュー承認/差し戻し（reviews.py）
- ユーザー作成/無効化・有効化/パスワード再発行（admin_users.py）
- 組織削除（admin_users.py）

呼び出し側のトランザクションに相乗りする（db.addのみ・commitは呼び出し側）。
"""
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.user import User


def record_audit(
    db: AsyncSession,
    user: User | None,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID | None = None,
    changes: dict | None = None,
) -> None:
    db.add(AuditLog(
        user_id=user.id if user else None,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        changes=changes,
    ))
