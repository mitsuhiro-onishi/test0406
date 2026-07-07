#!/bin/bash
# DOSL HUB ローカル開発サーバー起動スクリプト
# AI_PROVIDER: auto / anthropic / claude_cli / mock （未指定はauto）
cd "$(dirname "$0")/backend"
# auto: ANTHROPIC_API_KEYがあれば実AI解析(anthropic)、なければmock（ダミー解析）
# 実AIにするには backend/.env に ANTHROPIC_API_KEY=sk-... を書くか、環境変数で渡す
export AI_PROVIDER="${AI_PROVIDER:-auto}"
exec .venv/bin/uvicorn app.main:app --port 8710 --host 0.0.0.0
