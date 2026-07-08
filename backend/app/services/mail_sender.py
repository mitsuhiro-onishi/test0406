"""初期パスワード等の通知メール送信（指示書05の5-4）

メール受信（指示書04）と同じGmailアカウント・OAuth認証で users.messages.send を使う。
- MAIL_SEND_ENABLED=true かつ Gmail認証3変数が設定されているときだけ送信する
- 送信に失敗しても呼び出し元の処理は成功させる（Falseを返すだけ）。
  初期パスワードの画面表示フォールバックは常に残す
"""
import asyncio
import base64
import logging
from email.mime.text import MIMEText

from app.core.config import settings

logger = logging.getLogger(__name__)


def _send_raw(to: str, subject: str, body: str) -> None:
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build

    creds = Credentials(
        None,
        refresh_token=settings.gmail_refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.gmail_client_id,
        client_secret=settings.gmail_client_secret,
        scopes=["https://www.googleapis.com/auth/gmail.send"],
    )
    service = build("gmail", "v1", credentials=creds, cache_discovery=False)
    msg = MIMEText(body, "plain", "utf-8")
    msg["To"] = to
    msg["Subject"] = subject
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    service.users().messages().send(userId="me", body={"raw": raw}).execute()


async def send_mail(to: str, subject: str, body: str) -> bool:
    """送信できたらTrue。無効化・未設定・失敗はFalse（例外は投げない）"""
    if not settings.mail_send_enabled:
        return False
    if not (settings.gmail_client_id and settings.gmail_client_secret and settings.gmail_refresh_token):
        logger.warning("MAIL_SEND_ENABLED=true ですがGmail認証が未設定のため送信しません")
        return False
    try:
        await asyncio.to_thread(_send_raw, to, subject, body)
        logger.info("メール送信: %s（%s）", to, subject)
        return True
    except Exception:
        logger.exception("メール送信に失敗しました: %s", to)
        return False


async def send_credentials_mail(to: str, user_name: str, password: str,
                                is_reset: bool = False) -> bool:
    """アカウント発行/パスワード再発行の通知メール"""
    login_url = (settings.public_base_url or "").rstrip("/")
    lines = [
        f"{user_name} 様",
        "",
        "DOSL HUB（展示会ドキュメント管理システム）の"
        + ("パスワードを再発行しました。" if is_reset else "アカウントを発行しました。"),
        "",
        *( [f"ログインURL: {login_url}/login.html"] if login_url else [] ),
        f"メールアドレス: {to}",
        f"{'新しいパスワード' if is_reset else '初期パスワード'}: {password}",
        "",
        "このメールは大切に保管し、他の方に転送しないでください。",
        "※このメールに心当たりがない場合は破棄してください。",
    ]
    subject = "【DOSL HUB】" + ("パスワード再発行のお知らせ" if is_reset else "アカウント発行のお知らせ")
    return await send_mail(to, subject, "\n".join(lines))
