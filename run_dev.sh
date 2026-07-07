#!/bin/bash
# DOSL HUB ローカル開発サーバー起動スクリプト
# AI_PROVIDER: auto / anthropic / claude_cli / mock （未指定はauto）
cd "$(dirname "$0")/backend"
# auto: ANTHROPIC_API_KEYがあれば実AI解析(anthropic)、なければmock（ダミー解析）
# 実AIにするには backend/.env に ANTHROPIC_API_KEY=sk-... を書くか、環境変数で渡す
export AI_PROVIDER="${AI_PROVIDER:-auto}"
# 開発ではシードAPI (/api/seed) を有効化（本番はデフォルトの無効のまま使う）
export ENABLE_SEED="${ENABLE_SEED:-true}"
exec .venv/bin/uvicorn app.main:app --port 8710 --host 0.0.0.0
