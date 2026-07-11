"""初期パスワード等の通知メール送信（指示書05の5-4）

差出人はメール受信（指示書04）と同じdoslドメインのアドレス（hub@dosl.co.jp）。
- 送信経路は2系統: RESEND_API_KEY があればResend API（HTTP・クラウドから送れる推奨経路）、
  無ければSMTP（XserverはクラウドIPからのSMTPを拒否するためローカル開発時のみ有効・2026-07-12確認）
- MAIL_SEND_ENABLED=true のときだけ送信する
- 送信に失敗しても呼び出し元の処理は成功させる（Falseを返すだけ）。
  初期パスワードの画面表示フォールバックは常に残す
"""
import asyncio
import json
import logging
import smtplib
import urllib.request
from email.mime.text import MIMEText
from email.utils import formataddr

from app.core.config import settings

logger = logging.getLogger(__name__)

SENDER_NAME = "DOSL HUB"


def _send_via_resend(to: str, subject: str, body: str) -> None:
    payload = json.dumps({
        "from": formataddr((SENDER_NAME, settings.mail_address)),
        "to": [to],
        "subject": subject,
        "text": body,
    }).encode()
    req = urllib.request.Request(
        "https://api.resend.com/emails", data=payload, method="POST",
        headers={
            "Authorization": f"Bearer {settings.resend_api_key}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        json.loads(resp.read())  # 2xx以外はHTTPErrorで呼び元のexceptへ


def _send_via_smtp(to: str, subject: str, body: str) -> None:
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
    if not settings.mail_address:
        logger.warning("MAIL_SEND_ENABLED=true ですが MAIL_ADDRESS が未設定のため送信しません")
        return False
    try:
        if settings.resend_api_key:
            await asyncio.to_thread(_send_via_resend, to, subject, body)
        elif settings.mail_password and settings.mail_smtp_host:
            await asyncio.to_thread(_send_via_smtp, to, subject, body)
        else:
            logger.warning("MAIL_SEND_ENABLED=true ですが送信経路（Resend/SMTP）が未設定のため送信しません")
            return False
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
