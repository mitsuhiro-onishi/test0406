# マニュアル再生成手順

UIを変更したらマニュアルを作り直す。所要10分。

1. テストサーバー起動（テストDB・mock AI・port 8713）:
   ```
   cd backend
   DATABASE_URL="sqlite+aiosqlite:////tmp/dosl-test.db" UPLOAD_DIR=/tmp/dosl-uploads \
     ENABLE_SEED=true AI_PROVIDER=mock .venv/bin/uvicorn app.main:app --port 8713
   curl -X POST http://localhost:8713/api/seed
   ```
2. デモデータ投入（出展社ログイン→書類4種アップ＋出展申込1件。capture.py冒頭のコメント参照。
   手書きファイル名=レビュー待ち、ブース設営=設計仕様が入る）
3. スクリーンショット撮影（Chromeヘッドレス・backend/.venvのwebsockets使用）:
   ```
   backend/.venv/bin/python docs/マニュアル/tools/capture.py
   ```
   → tools/images/ にPNGが出る
4. docx生成（docx-jsが必要: `npm install docx` をtools/で実行）:
   ```
   node docs/マニュアル/tools/build_manuals.js
   ```
   → docs/マニュアル/ に2冊のdocxが上書き出力される

スタイル規約: 游ゴシック統一・表ヘッダーは黒(#222222)白文字・表幅16.5cm以内。
