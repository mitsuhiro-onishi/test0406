from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    # ローカル開発はSQLite。本番は環境変数 DATABASE_URL で
    # postgresql+asyncpg://... を指定して切替する
    database_url: str = "sqlite+aiosqlite:///./exhibition.db"
    upload_dir: str = "./uploads"
    max_file_size: int = 50 * 1024 * 1024  # 50MB
    max_request_size: int = 60 * 1024 * 1024  # multipart込み60MB
    max_files_per_request: int = 5
    daily_upload_files_per_user: int = 50
    daily_upload_bytes_per_user: int = 200 * 1024 * 1024
    daily_reanalysis_per_user: int = 20
    # ファイル保存先: "local"（VMディスク）/ "gcs"（Cloud Storage）。docs/指示書/03参照
    storage_backend: str = "local"
    gcs_bucket: str = ""

    # メール受信（doslドメイン専用アドレスのIMAPポーリング取込・docs/指示書/04参照）
    mail_ingest_enabled: bool = False
    mail_poll_interval_sec: int = 120
    mail_address: str = ""          # 例: hub@dosl.co.jp（受信・送信兼用）
    mail_password: str = ""
    mail_imap_host: str = ""        # 例: sv2237.xserver.jp（IMAP over SSL 993）
    mail_smtp_host: str = ""        # 例: sv2237.xserver.jp（SMTP over SSL）
    mail_smtp_port: int = 465

    # メール送信（初期パスワード通知・docs/指示書/05の5-4参照）
    # RESEND_API_KEY があればResend API（HTTP）で送る＝GCP等クラウドからの推奨経路。
    # 無ければ MAIL_SMTP_HOST へのSMTP送信（XserverはクラウドIPを拒否するため本番では不可・2026-07-12確認）
    mail_send_enabled: bool = False
    resend_api_key: str = ""
    # メール本文に載せるログインURL（本番: https://34-168-97-181.sslip.io）。空ならURL行を省略
    public_base_url: str = ""
    cors_origins: str = "http://localhost:3000,http://localhost:8000"
    secret_key: str = "local-dev-secret-key-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 8  # 標準的な運用シフト内に限定
    auth_cookie_name: str = "doslhub_session"
    # 本番は必ずtrue。ローカルHTTP開発時だけAUTH_COOKIE_SECURE=falseを指定する。
    auth_cookie_secure: bool = True
    login_attempts_per_account_15m: int = 10
    login_attempts_per_ip_15m: int = 50
    # OpenAPI管理面はsecure defaultで閉じ、ローカル開発時のみ明示的に有効化する。
    enable_api_docs: bool = False

    # AI解析プロバイダ: "auto" / "anthropic" / "claude_cli" / "mock"
    # auto: ANTHROPIC_API_KEYがあればanthropic、claudeコマンドがあればclaude_cli、なければmock
    ai_provider: str = "auto"
    anthropic_api_key: str = ""
    ai_model: str = "claude-sonnet-5"
    ai_max_concurrency: int = 1
    # 後方互換のため環境変数は受け付けるが、AI結果の自動承認には使用しない。
    # セキュリティ上、解析結果は信頼度に関係なく全件人手レビューへ送る。
    auto_approve_threshold: float = 0.85

    # デモデータ投入API (/api/seed) の有効化。本番では必ずfalseにする
    # （シードのデモアカウントはパスワードがリポジトリに公開されているため）
    enable_seed: bool = False
    # 本番シード時にデモアカウント全員のパスワードをこの値で上書きする
    # （空ならseed.py記載の開発用パスワードをそのまま使う）
    seed_password: str = ""

settings = Settings()
