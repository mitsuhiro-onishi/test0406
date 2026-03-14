from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://app:localdev@localhost:5432/exhibition_docs"
    upload_dir: str = "./uploads"
    max_file_size: int = 50 * 1024 * 1024  # 50MB
    cors_origins: str = "http://localhost:3000"
    secret_key: str = "local-dev-secret-key-change-in-production"

    class Config:
        env_file = ".env"


settings = Settings()
