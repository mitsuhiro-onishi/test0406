"""初期パスワード等の通知メール送信（指示書05の5-4）

メール受信（指示書04）と同じdoslドメインのメールアカウントからSMTPで送信する。
- MAIL_SEND_ENABLED=true かつ メールアカウント設定があるときだけ送信する
- 送信に失敗しても呼び出し元の処理は成功させる（Falseを返すだけ）。
  初期パスワードの画面表示フォールバックは常に残す
"""
import asyncio
import logging
import smtplib
from email.mime.text import MIMEText
from email.utils import formataddr

from app.core.config import settings

logger = logging.getLogger(__name__)

SENDER_NAME = "DOSL HUB"


def _send_raw(to: str, subject: str, body: str) -> None:
    msg = MIMEText(body, "plain", "utf-8")
    msg["From"] = formataddr((SENDER_NAME, settings.mail_address))
    msg["To"] = to
    msg["Subject"] = subject
    with smtplib.SMTP_SSL(settings.mail_smtp_host, settings.mail_smtp_port, timeout=30) as smtp:
        smtp.login(settings.mail_address, settings.mail_password)
        smtp.sendmail(settings.mail_address, [to], msg.as_string())


async def send_mail(to: str, subject: str, body: str) -> bool:
    """送信できたらTrue。無効化・未設定・失敗はFalse（例外は投げない）"""
    if not settings.mail_send_enabled:
        return False
    if not (settings.mail_address and settings.mail_password and settings.mail_smtp_host):
        logger.warning("MAIL_SEND_ENABLED=true ですがメールアカウントが未設定のため送信しません")
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
