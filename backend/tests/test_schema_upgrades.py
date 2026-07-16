"""既存SQLiteへ安全に認証失効列を追加できることを確認する。"""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.schema_upgrades import apply_schema_upgrades


async def test_adds_token_version_to_existing_users_table(tmp_path):
    database_path = tmp_path / "legacy.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{database_path}")
    try:
        async with engine.begin() as connection:
            await connection.execute(
                text("CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL)")
            )
            await apply_schema_upgrades(connection)
            columns = (
                await connection.execute(text("PRAGMA table_info(users)"))
            ).mappings().all()
            token_version = next(
                column for column in columns if column["name"] == "token_version"
            )
            assert token_version["notnull"] == 1
            assert token_version["dflt_value"] == "0"

            # 起動のたびに再実行しても二重追加しない。
            await apply_schema_upgrades(connection)
    finally:
        await engine.dispose()

