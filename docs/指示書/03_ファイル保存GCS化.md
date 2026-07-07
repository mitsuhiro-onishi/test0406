# 指示書03: ファイル保存のGCS化

## 目的
アップロードファイルが現状VMディスク（/opt/dosl-hub/data/uploads）保存。
Cloud Storageに移し、VM障害・ディスク容量から切り離す。
**急ぎではない**（30GBディスクで書類数千件は持つ）。書類が増えてきた時点で実施。

## 現状
- `Document.storage_path` にローカルパスが入る（抽象化済み＝この列の中身を差し替えるだけでよい）
- 書き込み: documents.py の upload（aiofilesで upload_dir へ）
- 読み出し: ①原本ダウンロードAPI（documents.py）②AI解析（ai_analyzer.py が storage_path を直接 open）
  ③design_spec_builder が floor_plan_storage_path にコピーするだけ（読まない）

## 確定設計

### 方針
- ストレージ抽象レイヤ `backend/app/services/storage.py` を新設し、書き込み/読み出しを集約
- 環境変数 `STORAGE_BACKEND=local|gcs`（デフォルトlocal＝ローカル開発は今までどおり）
- GCS時の storage_path は `gs://<bucket>/<exhibition_id>/<uuid>_<safe_filename>` 形式
- 判定は storage_path の接頭辞（`gs://` ならGCS）→ **移行後も旧ローカルパスの書類がそのまま読める**

### storage.py のインターフェース
```python
async def save_file(data: bytes, key: str) -> str      # 保存して storage_path を返す
async def read_file(storage_path: str) -> bytes        # ローカル/GCS両対応
async def open_local(storage_path: str) -> str         # AI解析用: ローカルパスを返す。
                                                       # GCSなら一時ファイルにDLしてパスを返す（呼び側でfinally削除）
```
- GCSクライアントは `google-cloud-storage`（requirements.txtに追加）。
  同期ライブラリなので `asyncio.to_thread` でラップする
- 認証はVMのデフォルトサービスアカウント（ADC）。ローカル開発でGCSを触る必要はない（local backendのまま）

### 呼び側の変更
- documents.py: 保存とダウンロードを storage.py 経由に
- ai_analyzer.py: `document.storage_path` を直接openしている箇所を `open_local()` 経由に
  （extract_office_text と run_anthropic のファイル読み込み）

### GCP側の作業（gcloudコマンド）
```bash
gcloud storage buckets create gs://dosl-hub-documents --project=dosl-hub-01 \
  --location=us-west1 --uniform-bucket-level-access
# VMのサービスアカウントに権限付与（VM作成時のデフォルトSA。gcloud compute instances describe dosl-hub で確認）
gcloud storage buckets add-iam-policy-binding gs://dosl-hub-documents \
  --member="serviceAccount:<VMのSA>" --role="roles/storage.objectAdmin"
# VMのアクセススコープがstorage-roを含む場合、read-writeにするにはVM停止→
# gcloud compute instances set-service-account dosl-hub --zone=us-west1-b \
#   --scopes=cloud-platform → 起動。ここが一番ハマりやすい（403が出たらスコープを疑う）
```
- 本番 .env に `STORAGE_BACKEND=gcs` と `GCS_BUCKET=dosl-hub-documents` を**追記**（上書き禁止）

### 既存ファイルの移行
- 移行しない（旧書類はローカルパスのまま読める設計のため）。
  全件移行したくなったら `gcloud storage cp -r /opt/dosl-hub/data/uploads gs://.../legacy/` ＋
  DBのstorage_path一括更新スクリプトを別途書く

## 検証
1. ローカル: STORAGE_BACKEND未設定で従来どおり動く（リグレッション）
2. 本番: 書類アップロード→GCSにオブジェクトができる→AI解析が走る→原本ダウンロードできる
3. 旧書類（ローカルパス）の原本ダウンロード・再解析も動くこと
4. 実ブラウザで出展社アップロード→管理画面で原本プレビュー表示まで確認

## デプロイ
requirements.txt が変わるのでVMで `sudo /opt/dosl-hub/backend/.venv/bin/pip install -r /opt/dosl-hub/backend/requirements.txt` を忘れない。
