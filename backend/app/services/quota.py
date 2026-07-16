"""SQLite/PostgreSQLで共有する原子的な固定窓クォータ。"""

import hashlib
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.quota_bucket import QuotaBucket


@dataclass(slots=True)
class QuotaExceeded(Exception):
    action: str


def fixed_window(seconds: int, now: datetime | None = None) -> str:
    current = now or datetime.now(timezone.utc)
    return str(int(current.timestamp()) // seconds)


def daily_window(now: datetime | None = None) -> str:
    return (now or datetime.now(timezone.utc)).date().isoformat()


def _bucket_key(action: str, identity: str, window: str) -> str:
    raw = f"{action}\0{identity}\0{window}".encode()
    return hashlib.sha256(raw).hexdigest()


async def consume_quota(
    db: AsyncSession,
    *,
    action: str,
    identity: str,
    window: str,
    count: int = 1,
    byte_count: int = 0,
    max_count: int,
    max_bytes: int | None = None,
) -> None:
    """上限内ならカウンターを原子的に加算し、超過時は例外を送出する。"""
    if count < 0 or byte_count < 0:
        raise ValueError("quota increments must be non-negative")
    if count > max_count or (max_bytes is not None and byte_count > max_bytes):
        raise QuotaExceeded(action)

    key = _bucket_key(action, identity, window)
    conditions = [
        QuotaBucket.key == key,
        QuotaBucket.count <= max_count - count,
    ]
    if max_bytes is not None:
        conditions.append(QuotaBucket.byte_count <= max_bytes - byte_count)

    statement = (
        update(QuotaBucket)
        .where(*conditions)
        .values(
            count=QuotaBucket.count + count,
            byte_count=QuotaBucket.byte_count + byte_count,
        )
    )
    result = await db.execute(statement)
    if result.rowcount == 1:
        await db.commit()
        return

    db.add(
        QuotaBucket(
            key=key,
            action=action,
            window=window,
            count=count,
            byte_count=byte_count,
        )
    )
    try:
        await db.commit()
        return
    except IntegrityError:
        await db.rollback()

    # 別プロセスが同時にbucketを作った場合だけ、もう一度原子的加算を試す。
    result = await db.execute(statement)
    if result.rowcount == 1:
        await db.commit()
        return
    await db.rollback()
    raise QuotaExceeded(action)
