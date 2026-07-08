"""Gmail APIのリフレッシュトークンを取得する（ローカルで1回だけ実行・指示書04）

前提（Google Cloud Console での準備・専用Gmailアカウントでログインして行う）:
1. プロジェクトを作成（既存の dosl-hub-01 でも可）
2. 「APIとサービス」→ Gmail API を有効化
3. 「認証情報」→ OAuthクライアントID を作成（種類=デスクトップアプリ）
   → クライアントIDとクライアントシークレットを控える
4. OAuth同意画面のテストユーザーに専用Gmailアドレスを追加

実行:
    .venv/bin/pip install google-auth-oauthlib   # 初回のみ
    .venv/bin/python scripts/gmail_auth.py <CLIENT_ID> <CLIENT_SECRET>

ブラウザが開くので専用Gmailアカウントで承認する。
表示された3行をVMの /opt/dosl-hub/backend/.env に追記する（上書き禁止）。
"""
import sys

SCOPES = [
    "https://www.googleapis.com/auth/gmail.modify",  # 受信取込（読取・既読化・ラベル）
    "https://www.googleapis.com/auth/gmail.send",    # 初期パスワード等の送信
]


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit("使い方: python scripts/gmail_auth.py <CLIENT_ID> <CLIENT_SECRET>")
    client_id, client_secret = sys.argv[1], sys.argv[2]

    from google_auth_oauthlib.flow import InstalledAppFlow

    flow = InstalledAppFlow.from_client_config(
        {
            "installed": {
                "client_id": client_id,
                "client_secret": client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": ["http://localhost"],
            }
        },
        scopes=SCOPES,
    )
    creds = flow.run_local_server(port=0, prompt="consent")

    print("\n──── .env に追記する3行（値は厳重に管理） ────")
    print(f"GMAIL_CLIENT_ID={client_id}")
    print(f"GMAIL_CLIENT_SECRET={client_secret}")
    print(f"GMAIL_REFRESH_TOKEN={creds.refresh_token}")
    print("──── 受信を有効化するには MAIL_INGEST_ENABLED=true、")
    print("──── 送信を有効化するには MAIL_SEND_ENABLED=true も追記 ────")


if __name__ == "__main__":
    main()
