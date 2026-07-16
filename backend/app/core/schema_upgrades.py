"""Small, explicit upgrades for the existing SQLite deployment.

SQLAlchemy's create_all creates missing tables but intentionally does not add
columns to existing ones. Keep upgrades additive and safe to run at startup.
"""

from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import AsyncConnection


async def apply_schema_upgrades(connection: AsyncConnection) -> None:
    def user_columns(sync_connection) -> set[str]:
        inspector = inspect(sync_connection)
        if "users" not in inspector.get_table_names():
            return set()
        return {column["name"] for column in inspector.get_columns("users")}

    columns = await connection.run_sync(user_columns)
    if columns and "token_version" not in columns:
        await connection.execute(
            text(
                "ALTER TABLE users "
                "ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0"
            )
        )
