#!/bin/bash
# =====================================================================
# DOSL HUB — GCP VM セットアップ（VM上で実行）
# ---------------------------------------------------------------------
# アプリ一式と backend/.env をVMに置いた状態で、フォルダ内で実行する:
#     sudo bash deploy/vm_setup.sh
# やること:
#   1) Python依存のインストール＋スワップ確保（e2-micro対策）
#   2) アプリを /opt/dosl-hub に配置（DB・アップロードは /opt/dosl-hub/data に永続化）
#   3) systemdで常時稼働（uvicorn・127.0.0.1:8710で内部起動）
#   4) SQLite毎時バックアップ（専用GCSバケットへ保存）
#   5) Caddyで自動HTTPS（<外部IP>.sslip.io）
# 認証はアプリ側のJWTログインが担う。CaddyはTLS終端のみ。
# ※ AEOツール（oclai-aeo）の vm_setup.sh と同構成。
# =====================================================================
set -e
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"   # このスクリプトの1つ上＝アプリ本体
APP_DIR=/opt/dosl-hub

if [ ! -f "$SRC_DIR/backend/.env" ]; then
  echo "‼ $SRC_DIR/backend/.env がありません。本番用 .env をVMに置いてください。"
  exit 1
fi
# 本番必須項目が空でないことを確認
for k in SECRET_KEY SEED_PASSWORD ANTHROPIC_API_KEY BACKUP_GCS_BUCKET; do
  v="$(grep -E "^$k=" "$SRC_DIR/backend/.env" | head -1 | cut -d= -f2- | tr -d "\"'")"
  if [ -z "$v" ]; then
    echo "‼ backend/.env の $k が空です。本番用の値を設定してください。"
    exit 1
  fi
done

echo "==> 1/6 依存パッケージ"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y python3 python3-venv python3-pip curl debian-keyring debian-archive-keyring apt-transport-https

echo "==> 1.5 スワップ確保（e2-microは1GB RAM・pip導入の保険）"
if [ ! -f /swapfile ]; then
  fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi

echo "==> 2/6 アプリ配置（$APP_DIR・データは $APP_DIR/data に永続）"
mkdir -p "$APP_DIR" "$APP_DIR/data/uploads"
cp -r "$SRC_DIR"/. "$APP_DIR"/
chmod 600 "$APP_DIR/backend/.env"
cd "$APP_DIR/backend"
python3 -m venv .venv
./.venv/bin/pip install --upgrade pip -q
./.venv/bin/pip install -r requirements.txt -q

echo "==> 3/6 常時稼働サービス（systemd・内部127.0.0.1:8710）"
cat >/etc/systemd/system/dosl-hub.service <<EOF
[Unit]
Description=DOSL HUB exhibition document management
After=network.target

[Service]
WorkingDirectory=$APP_DIR/backend
ExecStart=$APP_DIR/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8710
Restart=always
RestartSec=3
User=root

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable dosl-hub
systemctl restart dosl-hub

echo "==> 4/6 SQLite毎時バックアップ"
mkdir -p "$APP_DIR/data/backups"
chmod 700 "$APP_DIR/data/backups"
install -m 0644 "$APP_DIR/deploy/dosl-hub-backup.service" /etc/systemd/system/
install -m 0644 "$APP_DIR/deploy/dosl-hub-backup.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now dosl-hub-backup.timer

echo "==> 5/6 Caddy（自動HTTPS）"
if ! command -v caddy >/dev/null 2>&1; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' >/etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi
IP="$(curl -s -H 'Metadata-Flavor: Google' 'http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip')"
HOSTN="${IP//./-}.sslip.io"
cat >/etc/caddy/Caddyfile <<EOF
$HOSTN {
    reverse_proxy 127.0.0.1:8710 {
        header_up Host {host}
    }
}
EOF
systemctl restart caddy

echo "==> 6/6 完了"
echo "============================================================"
echo "  公開URL : https://$HOSTN/login.html"
echo "  ログイン: シードのデモアカウント（パスワードは .env の SEED_PASSWORD）"
echo "  ※ 初回は証明書発行に30〜60秒。つながらなければ1分待って再アクセス。"
echo "  ※ 初回シードは ENABLE_SEED=true で起動中に POST /api/seed → false に戻す。"
echo "============================================================"
