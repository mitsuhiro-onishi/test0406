from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ローカル開発はSQLite。本番は環境変数 DATABASE_URL で
    # postgresql+asyncpg://... を指定して切替する
    database_url: str = "sqlite+aiosqlite:///./exhibition.db"
    upload_dir: str = "./uploads"
    max_file_size: int = 50 * 1024 * 1024  # 50MB
    cors_origins: str = "http://localhost:3000,http://localhost:8000"
    secret_key: str = "local-dev-secret-key-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 12  # 12時間

    # AI解析プロバイダ: "auto" / "anthropic" / "claude_cli" / "mock"
    # auto: ANTHROPIC_API_KEYがあればanthropic、claudeコマンドがあればclaude_cli、なければmock
    ai_provider: str = "auto"
    anthropic_api_key: str = ""
    ai_model: str = "claude-sonnet-5"
    # 信頼度がこの値以上なら自動承認、未満ならレビュー待ちにする
    auto_approve_threshold: float = 0.85

    # デモデータ投入API (/api/seed) の有効化。本番では必ずfalseにする
    # （シードのデモアカウントはパスワードがリポジトリに公開されているため）
    enable_seed: bool = False
    # 本番シード時にデモアカウント全員のパスワードをこの値で上書きする
    # （空ならseed.py記載の開発用パスワードをそのまま使う）
    seed_password: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
