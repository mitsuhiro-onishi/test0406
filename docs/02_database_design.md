# データベース設計書

## 1. ER図（概念）

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│ organizations│     │ exhibitions  │     │ exhibition_roles │
│ (組織)       │────<│ (展示会)      │────<│ (展示会×組織役割)  │
└──────────────┘     └──────┬───────┘     └──────────────────┘
                            │
                     ┌──────┴───────┐
                     │ booths       │
                     │ (ブース)      │
                     └──────┬───────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
       ┌──────┴──────┐ ┌───┴────────┐ ┌──┴──────────────┐
       │ documents   │ │ orders     │ │ design_specs    │
       │ (原本)      │ │ (注文)      │ │ (設計仕様)       │
       └──────┬──────┘ └───┬────────┘ └─────────────────┘
              │            │
       ┌──────┴──────┐ ┌───┴────────┐
       │ ai_analyses │ │ order_items│
       │ (AI解析結果) │ │ (注文明細)  │
       └─────────────┘ └────────────┘
```

---

## 2. テーブル定義

### 2.1 organizations（組織）

主催者、装飾業者、出展社、協力会社（電気施工会社、弁当会社等）を統一管理する。
主催者・装飾業者・協力会社はドキュメントの受信側（主催者側）として機能する。

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | UUID | PK | 組織ID |
| name | VARCHAR(200) | NOT NULL | 組織名 |
| name_kana | VARCHAR(200) | | 組織名カナ |
| org_type | ENUM | NOT NULL | 'organizer' / 'decorator' / 'exhibitor' / 'partner' |
| contact_email | VARCHAR(255) | | 代表メールアドレス |
| contact_phone | VARCHAR(20) | | 代表電話番号 |
| address | TEXT | | 住所 |
| created_at | TIMESTAMP | NOT NULL | 作成日時 |
| updated_at | TIMESTAMP | NOT NULL | 更新日時 |

> **org_type 補足:**
> - `organizer`: 主催者
> - `decorator`: 装飾業者
> - `exhibitor`: 出展社（ドキュメント送信側）
> - `partner`: 協力会社（電気施工会社、弁当会社等。主催者側としてドキュメントを受信する）

### 2.2 users（ユーザー）

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | UUID | PK | ユーザーID |
| organization_id | UUID | FK → organizations | 所属組織 |
| email | VARCHAR(255) | UNIQUE, NOT NULL | メールアドレス |
| name | VARCHAR(100) | NOT NULL | 氏名 |
| role | ENUM | NOT NULL | 'admin' / 'manager' / 'member' |
| auth_provider_id | VARCHAR(255) | | 外部認証プロバイダID |
| is_active | BOOLEAN | DEFAULT true | 有効フラグ |
| created_at | TIMESTAMP | NOT NULL | 作成日時 |
| updated_at | TIMESTAMP | NOT NULL | 更新日時 |

### 2.3 exhibitions（展示会）

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | UUID | PK | 展示会ID |
| name | VARCHAR(300) | NOT NULL | 展示会名 |
| venue | VARCHAR(200) | | 会場名 |
| start_date | DATE | NOT NULL | 開催開始日 |
| end_date | DATE | NOT NULL | 開催終了日 |
| setup_start_date | DATE | | 施工開始日 |
| setup_end_date | DATE | | 施工終了日 |
| organizer_id | UUID | FK → organizations | 主催者 |
| status | ENUM | NOT NULL | 'draft' / 'active' / 'closed' / 'archived' |
| document_deadline | TIMESTAMP | | 書類提出締切 |
| created_at | TIMESTAMP | NOT NULL | 作成日時 |
| updated_at | TIMESTAMP | NOT NULL | 更新日時 |

### 2.4 exhibition_roles（展示会×組織の役割）

展示会ごとに組織の役割を定義する中間テーブル。

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | UUID | PK | ID |
| exhibition_id | UUID | FK → exhibitions | 展示会 |
| organization_id | UUID | FK → organizations | 組織 |
| role | ENUM | NOT NULL | 'organizer' / 'decorator' / 'exhibitor' / 'partner' |
| booth_id | UUID | FK → booths, NULL可 | 割当ブース（出展社の場合） |
| created_at | TIMESTAMP | NOT NULL | 作成日時 |

UNIQUE制約: (exhibition_id, organization_id)

### 2.5 booths（ブース）

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | UUID | PK | ブースID |
| exhibition_id | UUID | FK → exhibitions | 展示会 |
| booth_number | VARCHAR(20) | NOT NULL | ブース番号 |
| exhibitor_id | UUID | FK → organizations, NULL可 | 出展社 |
| area_sqm | DECIMAL(8,2) | | 面積（㎡） |
| location_zone | VARCHAR(50) | | ゾーン区分 |
| status | ENUM | NOT NULL | 'vacant' / 'assigned' / 'setup' / 'ready' |
| created_at | TIMESTAMP | NOT NULL | 作成日時 |
| updated_at | TIMESTAMP | NOT NULL | 更新日時 |

UNIQUE制約: (exhibition_id, booth_number)

### 2.6 documents（ドキュメント原本）

受信した全ドキュメントの原本情報を保管。
出展社から主催者側（主催者・装飾業者・協力会社）へ送付されるドキュメントを管理する。

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | UUID | PK | ドキュメントID |
| exhibition_id | UUID | FK → exhibitions | 展示会 |
| booth_id | UUID | FK → booths, NULL可 | 関連ブース |
| uploaded_by_org_id | UUID | FK → organizations | 送信元組織（出展社） |
| uploaded_by_user_id | UUID | FK → users, NULL可 | 送信ユーザー |
| recipient_org_id | UUID | FK → organizations | 宛先組織（主催者側：主催者・装飾業者・協力会社） |
| file_name | VARCHAR(500) | NOT NULL | 元ファイル名 |
| file_type | VARCHAR(50) | NOT NULL | MIMEタイプ |
| file_size_bytes | BIGINT | NOT NULL | ファイルサイズ |
| storage_path | VARCHAR(1000) | NOT NULL | S3パス |
| source_channel | ENUM | NOT NULL | 'web_upload' / 'camera_capture' |
| source_detail | JSONB | | 受信詳細（アップロード元情報等） |
| document_category | ENUM | | 'order' / 'design' / 'contract' / 'other' |
| status | ENUM | NOT NULL | 'received' / 'processing' / 'analyzed' / 'review_needed' / 'confirmed' / 'error' |
| created_at | TIMESTAMP | NOT NULL | 受信日時 |
| updated_at | TIMESTAMP | NOT NULL | 更新日時 |

> **source_channel 補足:**
> - `web_upload`: Webブラウザからのアップロード（現在の主要受付チャネル）
> - `camera_capture`: カメラ撮影による取り込み
>
> ※ メール受信（`email`）は将来対応予定

> **recipient_org_id 補足:**
> 宛先組織は主催者側の組織（organizer / decorator / partner）を指定する。
> 例：電気工事関連の書類 → 電気施工会社（partner）、装飾関連の書類 → 装飾業者（decorator）

### 2.7 ai_analyses（AI解析結果）

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | UUID | PK | 解析ID |
| document_id | UUID | FK → documents | 対象ドキュメント |
| extracted_text | TEXT | | 抽出テキスト（OCR/パース結果） |
| structured_data | JSONB | NOT NULL | LLMが構造化したJSON |
| confidence_score | DECIMAL(3,2) | NOT NULL | 信頼度スコア (0.00〜1.00) |
| llm_model | VARCHAR(100) | | 使用LLMモデル名 |
| llm_prompt_tokens | INTEGER | | プロンプトトークン数 |
| llm_completion_tokens | INTEGER | | 完了トークン数 |
| processing_time_ms | INTEGER | | 処理時間（ミリ秒） |
| review_status | ENUM | NOT NULL | 'auto_approved' / 'pending_review' / 'reviewed' / 'rejected' |
| reviewed_by_user_id | UUID | FK → users, NULL可 | レビュー者 |
| reviewed_at | TIMESTAMP | | レビュー日時 |
| review_notes | TEXT | | レビューコメント |
| created_at | TIMESTAMP | NOT NULL | 解析日時 |

### 2.8 orders（注文）

AI解析から確定した注文データ。

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | UUID | PK | 注文ID |
| document_id | UUID | FK → documents | 元ドキュメント |
| ai_analysis_id | UUID | FK → ai_analyses | 解析結果 |
| exhibition_id | UUID | FK → exhibitions | 展示会 |
| booth_id | UUID | FK → booths, NULL可 | ブース |
| exhibitor_id | UUID | FK → organizations | 出展社 |
| order_date | DATE | | 注文日 |
| delivery_date | DATE | | 希望納期 |
| total_amount | DECIMAL(12,2) | | 合計金額 |
| currency | VARCHAR(3) | DEFAULT 'JPY' | 通貨 |
| special_instructions | TEXT | | 特記事項 |
| status | ENUM | NOT NULL | 'draft' / 'confirmed' / 'in_progress' / 'completed' / 'cancelled' |
| created_at | TIMESTAMP | NOT NULL | 作成日時 |
| updated_at | TIMESTAMP | NOT NULL | 更新日時 |

### 2.9 order_items（注文明細）

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | UUID | PK | 明細ID |
| order_id | UUID | FK → orders | 注文 |
| item_name | VARCHAR(300) | NOT NULL | 品目名 |
| item_category | VARCHAR(100) | | 品目カテゴリ |
| quantity | DECIMAL(10,2) | NOT NULL | 数量 |
| unit | VARCHAR(20) | | 単位 |
| unit_price | DECIMAL(12,2) | | 単価 |
| total_price | DECIMAL(12,2) | | 合計 |
| specifications | JSONB | | 仕様詳細 |
| sort_order | INTEGER | DEFAULT 0 | 表示順 |
| created_at | TIMESTAMP | NOT NULL | 作成日時 |

### 2.10 design_specs（設計仕様）

AI解析から確定した設計仕様データ。

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | UUID | PK | 設計仕様ID |
| document_id | UUID | FK → documents | 元ドキュメント |
| ai_analysis_id | UUID | FK → ai_analyses | 解析結果 |
| exhibition_id | UUID | FK → exhibitions | 展示会 |
| booth_id | UUID | FK → booths | ブース |
| width_mm | DECIMAL(10,2) | | 幅（mm） |
| depth_mm | DECIMAL(10,2) | | 奥行（mm） |
| height_mm | DECIMAL(10,2) | | 高さ（mm） |
| materials | JSONB | | 素材リスト |
| electrical_requirements | JSONB | | 電気工事要件 |
| structural_details | JSONB | | 構造詳細 |
| special_requirements | TEXT | | 特殊要件 |
| floor_plan_storage_path | VARCHAR(1000) | | 図面ファイルパス |
| version | INTEGER | DEFAULT 1 | バージョン |
| status | ENUM | NOT NULL | 'draft' / 'confirmed' / 'revised' |
| created_at | TIMESTAMP | NOT NULL | 作成日時 |
| updated_at | TIMESTAMP | NOT NULL | 更新日時 |

### 2.11 notifications（通知）

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | UUID | PK | 通知ID |
| user_id | UUID | FK → users | 宛先ユーザー |
| type | VARCHAR(50) | NOT NULL | 通知種別 |
| title | VARCHAR(200) | NOT NULL | タイトル |
| message | TEXT | | 本文 |
| reference_type | VARCHAR(50) | | 参照エンティティ種別 |
| reference_id | UUID | | 参照エンティティID |
| is_read | BOOLEAN | DEFAULT false | 既読フラグ |
| created_at | TIMESTAMP | NOT NULL | 作成日時 |

### 2.12 audit_logs（監査ログ）

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | UUID | PK | ログID |
| user_id | UUID | FK → users, NULL可 | 操作ユーザー |
| action | VARCHAR(50) | NOT NULL | 操作種別 |
| entity_type | VARCHAR(50) | NOT NULL | 対象エンティティ種別 |
| entity_id | UUID | | 対象エンティティID |
| changes | JSONB | | 変更内容 |
| ip_address | INET | | IPアドレス |
| user_agent | TEXT | | ユーザーエージェント |
| created_at | TIMESTAMP | NOT NULL | 操作日時 |

---

## 3. インデックス設計

```sql
-- documents: 頻繁な検索パターンに対応
CREATE INDEX idx_documents_exhibition ON documents(exhibition_id);
CREATE INDEX idx_documents_booth ON documents(booth_id);
CREATE INDEX idx_documents_org ON documents(uploaded_by_org_id);
CREATE INDEX idx_documents_recipient ON documents(recipient_org_id);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_category ON documents(document_category);
CREATE INDEX idx_documents_created ON documents(created_at DESC);

-- orders: 展示会別・出展社別検索
CREATE INDEX idx_orders_exhibition ON orders(exhibition_id);
CREATE INDEX idx_orders_exhibitor ON orders(exhibitor_id);
CREATE INDEX idx_orders_booth ON orders(booth_id);
CREATE INDEX idx_orders_status ON orders(status);

-- ai_analyses: レビュー待ちの検索
CREATE INDEX idx_ai_analyses_review ON ai_analyses(review_status)
  WHERE review_status = 'pending_review';
CREATE INDEX idx_ai_analyses_document ON ai_analyses(document_id);

-- notifications: ユーザー別未読
CREATE INDEX idx_notifications_user_unread ON notifications(user_id)
  WHERE is_read = false;

-- audit_logs: 時系列検索
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
```

---

## 4. JSONB構造例

### 4.1 ai_analyses.structured_data（注文書の場合）

```json
{
  "document_type": "order",
  "detected_booth_number": "A-12",
  "detected_company_name": "株式会社サンプル",
  "order_items": [
    {
      "item_name": "パネル（白） W900×H2400",
      "quantity": 10,
      "unit": "枚",
      "unit_price": 5000,
      "total_price": 50000
    },
    {
      "item_name": "スポットライト 100W",
      "quantity": 4,
      "unit": "台",
      "unit_price": 3000,
      "total_price": 12000
    }
  ],
  "delivery_date": "2026-04-01",
  "total_amount": 62000,
  "special_instructions": "搬入は前日16時以降希望",
  "extraction_notes": "金額は税抜表記と判断"
}
```

### 4.2 design_specs.materials

```json
[
  {
    "name": "木工パネル",
    "specification": "t12 メラミン化粧板仕上げ",
    "color": "ホワイト",
    "area": "壁面全面"
  },
  {
    "name": "カーペット",
    "specification": "ニードルパンチ",
    "color": "グレー",
    "area": "床面全面"
  }
]
```
