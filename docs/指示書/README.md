# 残タスク実装指示書（Sonnet 5向け）

DOSL HUBの残タスクを、このフォルダの指示書だけで実装できるように設計を確定させたもの（2026-07-08作成・Fable 5設計）。
各指示書は「目的 → 確定設計 → 実装手順 → 検証 → デプロイ」の構成。**設計の再検討は不要**。迷ったら指示書の設計に従うこと。

## 実装順序（推奨）

| # | 指示書 | 内容 | 規模感 |
|---|--------|------|--------|
| 1 | [01_複数展示会UI.md](01_複数展示会UI.md) | 展示会の作成/編集API＋画面切替セレクタ | 半日 |
| 2 | [02_一括アップロードAPI.md](02_一括アップロードAPI.md) | 複数ファイルを1リクエストで受ける | 小 |
| 3 | [03_ファイル保存GCS化.md](03_ファイル保存GCS化.md) | VMディスク→Cloud Storage | 半日 |
| 4 | [04_メール受信.md](04_メール受信.md) | 専用アドレスへの添付を自動取り込み（Phase 2） | 1〜2日 |
| 5 | [05_小粒改善リスト.md](05_小粒改善リスト.md) | 通知ポーリング等の既知の改善点 | 随時 |

## 全タスク共通ルール（必ず守る）

1. **変更は1つずつ・既存機能を壊さない**。実装→検証→コミットを1タスクずつ回す
2. **検証はcurlで止めず実ブラウザで行う**（JS実行・描画まで確認）。ログイン→対象画面の操作→スクリーンショット
3. ローカル検証はテスト用DBで行う（ローカル開発DBを汚さない）:
   ```bash
   cd backend
   DATABASE_URL="sqlite+aiosqlite:////tmp/dosl-test.db" UPLOAD_DIR=/tmp/dosl-uploads \
     ENABLE_SEED=true AI_PROVIDER=mock .venv/bin/uvicorn app.main:app --port 8713
   curl -X POST http://localhost:8713/api/seed   # 初回のみ
   # デモアカウント: admin@dosl-hub.example.com / admin1234（seed.py参照）
   ```
4. **本番デプロイ**は [../../deploy/公開手順_GCP.md](../../deploy/公開手順_GCP.md) の「更新」手順どおり
   （rsyncで除外→scp→/opt/dosl-hub/へcp→restart）。**VM上の backend/.env は絶対に上書きしない**
5. 新しいテーブル・カラムは `Base.metadata.create_all` で自動作成される（新テーブルはOK）。
   ただし**既存テーブルへのカラム追加はcreate_allでは反映されない**。本番SQLiteに
   `sudo sqlite3 /opt/dosl-hub/data/exhibition.db "ALTER TABLE ..."` を実行する手順を指示書に従って行う
6. コードの流儀は既存に合わせる（APIは applications.py / admin_users.py、UIは admin.html の既存タブがお手本）
7. 完了したら docs/HANDOVER.md の残タスク表を更新し、日本語でコミット（末尾に Co-Authored-By 行）

## 参照すべき既存ファイル

- API実装パターン: `backend/app/api/admin_users.py`（CRUD・ガード・日本語エラー）
- 生成サービスパターン: `backend/app/services/order_builder.py` / `design_spec_builder.py`
- UIタブ追加パターン: `web/admin.html` の「ユーザー管理」「設計仕様」タブ（2026-07-08追加分）
- 認可: `backend/app/core/security.py`（require_manager=admin/organizer、require_staff=+partner/viewer）
- 権限分離の検証観点: exhibitor=自社のみ／partner=自社宛カテゴリのみ／manager=全件
