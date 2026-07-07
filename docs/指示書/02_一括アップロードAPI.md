# 指示書02: 一括アップロードAPI

## 目的
フロントは複数ファイル選択に対応済みだが、1ファイルずつ直列で `POST /api/documents/upload` を呼んでいる。
1リクエストで複数ファイルを受けるAPIを作り、フロントを切り替える。

## 現状
- `backend/app/api/documents.py` の upload エンドポイントが単一 `file: UploadFile` を受ける
- 保存処理: upload_dir へ書き込み → Document作成 → `asyncio.create_task(analyze_document(id))` でバックグラウンド解析
- index.html のアップロードフローが選択ファイルをループして直列POST

## 確定設計

### API（documents.py に追加。既存の単一版は残す＝後方互換）
```
POST /api/documents/bulk-upload   （既存uploadと同じ認可）
  multipart: files=複数, exhibition_id, submission_category_id
  レスポンス 207相当（200で返す）:
  { "data": [
      {"file_name": "...", "ok": true,  "id": "<document_id>"},
      {"file_name": "...", "ok": false, "error": "50MBを超えています"}
  ]}
```
- 1ファイルずつ既存uploadと同じバリデーション（サイズ・拡張子）を通し、
  **失敗したファイルがあっても他は保存する**（全体404/400にしない）
- ファイル数上限20。超えたら400
- 保存成功分はそれぞれ `analyze_document` をバックグラウンド起動（既存と同じ）
- 実装は既存uploadの本体をプライベート関数 `_save_one(file, ...) -> Document` に切り出し、
  単一版・一括版の両方から呼ぶ形にリファクタする（ロジック二重化禁止）

### UI（index.html）
- 選択ファイルのループを `bulk-upload` 1回に置き換える
- 結果配列を見て、失敗ファイルは一覧に赤字表示（成功分はそのまま解析ポーリングへ）

## 検証
1. テストDBで3ファイル同時アップロード→3件とも解析される（mockでOK）
2. 1つだけ不正な拡張子を混ぜる→そのファイルだけ error、他2件は成功
3. 実ブラウザ: 出展社ポータルで複数ファイルD&D→進捗表示→全件「解析済」になること
4. リグレッション: 単一ファイルアップロードも従来どおり動くこと

## デプロイ
公開手順_GCP.mdの更新手順どおり。DBスキーマ変更なし。
