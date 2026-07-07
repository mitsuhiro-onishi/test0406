#!/bin/bash
# DOSL HUB ローカル開発サーバー起動スクリプト
# AI_PROVIDER: auto / anthropic / claude_cli / mock （未指定はauto）
cd "$(dirname "$0")/backend"
export AI_PROVIDER="${AI_PROVIDER:-mock}"
exec .venv/bin/uvicorn app.main:app --port 8710 --host 0.0.0.0
