# DOSL HUB — GCP 公開手順・運用メモ（2026-07-08 デプロイ済み）

AEOツールと同構成（e2-micro + Caddy自動HTTPS + sslip.io）。**すでに本番稼働中**。
このドキュメントは再デプロイ・運用・障害対応のためのランブック。

## 本番環境（2026-07-08 構築）

| 項目 | 値 |
|------|-----|
| 公開URL | https://34-168-97-181.sslip.io/login.html |
| 出展申込フォーム | https://34-168-97-181.sslip.io/apply.html?exhibition=<展示会ID>（受付ON時のみ） |
| GCPプロジェクト | dosl-hub-01（課金: 011651-09B46B-AB8F90） |
| VM | dosl-hub（e2-micro・us-west1-b・Debian12・30GB・固定IP 34.168.97.181） |
| 費用 | 約1,500円/月（e2-micro有償※無料枠はAEOツールが使用済み）＋AI解析API従量（1書類数円） |
| アプリ配置 | /opt/dosl-hub（コード）・/opt/dosl-hub/data（DB=SQLite・アップロードファイル＝永続） |
| サービス | systemd `dosl-hub`（uvicorn 127.0.0.1:8710）＋ `caddy`（TLS終端） |
| 本番設定 | /opt/dosl-hub/backend/.env（600・SECRET_KEY/ANTHROPIC_API_KEY/SEED_PASSWORD等） |
| ログイン | シードのデモアカウント×SEED_PASSWORD（Macローカル: 本番ログイン情報.txt 参照・git管理外） |

## 本番の状態
- ENABLE_SEED=false（/api/seed は404）。初回シードは投入済み（7アカウント・展示会1件）
- デモパスワード（admin1234等）は本番では無効。全アカウント SEED_PASSWORD で作成済み
- AI解析: AI_PROVIDER=anthropic（claude-sonnet-5）。解析結果は信頼度に関係なく全件人手レビュー後に確定する
- **ファイル保存はGCS（2026-07-10切替）**: `STORAGE_BACKEND=gcs` / `GCS_BUCKET=dosl-hub-documents`。
  VMスコープ=cloud-platform・SAにバケット限定objectAdmin。旧書類はローカルパスのまま読める（/opt/dosl-hub/data/uploads は消さない）。
  アップロードが403になったらスコープとバケットIAMを疑う
- メール受信/送信（指示書04＋5-4）はコード・DB列とも本番反映済みだが .env のフラグ未設定＝OFF
- 認証JWTはSecure/HttpOnly/SameSite=Strict Cookieで保持する。本番では`AUTH_COOKIE_SECURE=true`（未指定時もtrue）が必須

## 更新（コードを直したら）

Macのアプリフォルダで:
```bash
cd /Users/alltokyo42/Projects/exhibition-systems/document-management
# 転送パッケージを作る（ローカルDB・uploads・.env・.venvは除外）
STAGE=$(mktemp -d)/dosl-hub-deploy && mkdir -p $STAGE
rsync -a --exclude='.venv' --exclude='__pycache__' --exclude='exhibition.db' \
      --exclude='uploads' --exclude='.env' backend $STAGE/
rsync -a web deploy $STAGE/
# 転送先の残骸を必ず消してからscpする（残っているとscpが ~/dosl-hub-update/dosl-hub-deploy/ に
# 入れ子コピーしてしまい、cpしても本番ファイルが更新されない。2026-07-08に実際に発生）
gcloud compute ssh dosl-hub --zone=us-west1-b --project=dosl-hub-01 --command="rm -rf ~/dosl-hub-update"
gcloud compute scp --recurse $STAGE dosl-hub:~/dosl-hub-update --zone=us-west1-b --project=dosl-hub-01
gcloud compute ssh dosl-hub --zone=us-west1-b --project=dosl-hub-01 --command="
  sudo cp -r ~/dosl-hub-update/. /opt/dosl-hub/ && sudo systemctl restart dosl-hub && rm -rf ~/dosl-hub-update"
# デプロイ後は必ずハッシュで反映を確認する（curlのHTTP 200だけでは旧コードでも通る）
shasum -a 256 web/admin.html
curl -s https://34-168-97-181.sslip.io/admin.html | shasum -a 256   # ↑と一致すること
```
※ 本番 .env（/opt/dosl-hub/backend/.env）は上書きしないこと。データは /opt/dosl-hub/data にあるためコード上書きで消えない。
※ requirements.txt を変えた場合はVMで `cd /opt/dosl-hub/backend && sudo ./.venv/bin/pip install -r requirements.txt` も実行。
※ ローカルHTTPでログイン動作を確認する場合だけ、起動時に`AUTH_COOKIE_SECURE=false`を指定する。本番では使用しない。

## 運用コマンド

```bash
# SSH
gcloud compute ssh dosl-hub --zone=us-west1-b --project=dosl-hub-01
# ログ
sudo journalctl -u dosl-hub -f      # アプリ
sudo journalctl -u caddy -f         # HTTPS
# 再起動
sudo systemctl restart dosl-hub
# 停止/再開（停止中はVM代がかからない。固定IPは月数百円かかる点に注意）
gcloud compute instances stop dosl-hub --zone=us-west1-b --project=dosl-hub-01
gcloud compute instances start dosl-hub --zone=us-west1-b --project=dosl-hub-01
```

## 初回構築の記録（再現手順）

1. `gcloud projects create dosl-hub-01 && gcloud billing projects link dosl-hub-01 --billing-account=011651-09B46B-AB8F90`
2. `gcloud services enable compute.googleapis.com --project=dosl-hub-01`
3. 固定IP確保→e2-micro作成（--tags=http-server,https-server）→ファイアウォール80/443
4. 転送パッケージ（上記rsync構成＋本番 .env）を `gcloud compute scp` でVMへ
5. VM上で `sudo bash deploy/vm_setup.sh`（Python venv・systemd・Caddy を自動構築）
6. 初回シード: .env の ENABLE_SEED を一時的に true→ `curl -X POST http://127.0.0.1:8710/api/seed` → false に戻して restart
   ※ restart直後は起動待ちが必要（/api/health が返るまでポーリングしてからseedを叩く）

## セキュリティ
- APIキー・SECRET_KEYはVM内 .env（600）のみ。gitに含まれない
- 開放ポートは80/443のみ。アプリは127.0.0.1でのみlisten
- /api/seed は本番で無効（404）。デモ用パスワードは本番に存在しない
- JWTはJavaScriptへ返さず、Secure/HttpOnly/SameSite=Strict Cookieに保存。CSPでインラインJavaScriptを禁止
