# API設計書

## 1. API概要

- ベースURL: `https://api.example.com/v1`
- 認証: Bearer Token (JWT)
- レスポンス形式: JSON
- 日時形式: ISO 8601 (UTC)
- ページネーション: Cursor-based

### 共通レスポンス構造

```json
{
  "data": { ... },
  "meta": {
    "request_id": "uuid",
    "timestamp": "2026-03-14T00:00:00Z"
  }
}
```

### エラーレスポンス

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "入力値が不正です",
    "details": [
      { "field": "name", "message": "必須項目です" }
    ]
  }
}
```

### ページネーション

```json
{
  "data": [ ... ],
  "pagination": {
    "cursor": "eyJpZCI6...",
    "has_more": true,
    "total_count": 150
  }
}
```

---

## 2. 認証 API

### POST /auth/login
ログイン（OAuth連携後のトークン発行）

### POST /auth/refresh
トークンリフレッシュ

### POST /auth/logout
ログアウト

---

## 3. 展示会 API

### GET /exhibitions
展示会一覧を取得

**クエリパラメータ:**
| パラメータ | 型 | 説明 |
|-----------|-----|------|
| status | string | draft / active / closed / archived |
| cursor | string | ページネーションカーソル |
| limit | integer | 取得件数 (default: 20, max: 100) |

**レスポンス: 200**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "第15回 国際展示会",
      "venue": "東京ビッグサイト",
      "start_date": "2026-06-01",
      "end_date": "2026-06-03",
      "status": "active",
      "booth_count": 120,
      "document_count": 340,
      "document_deadline": "2026-05-15T23:59:59Z"
    }
  ]
}
```

### POST /exhibitions
展示会を作成（主催者のみ）

**リクエストボディ:**
```json
{
  "name": "第15回 国際展示会",
  "venue": "東京ビッグサイト",
  "start_date": "2026-06-01",
  "end_date": "2026-06-03",
  "setup_start_date": "2026-05-30",
  "setup_end_date": "2026-05-31",
  "document_deadline": "2026-05-15T23:59:59Z"
}
```

### GET /exhibitions/{id}
展示会詳細を取得

### PUT /exhibitions/{id}
展示会情報を更新

### GET /exhibitions/{id}/summary
展示会のサマリー統計を取得

**レスポンス: 200**
```json
{
  "data": {
    "total_booths": 120,
    "assigned_booths": 98,
    "total_documents": 340,
    "documents_by_status": {
      "received": 10,
      "processing": 5,
      "analyzed": 280,
      "review_needed": 15,
      "confirmed": 25,
      "error": 5
    },
    "total_orders": 95,
    "total_order_amount": 12500000,
    "submission_rate": 0.82
  }
}
```

---

## 4. ブース API

### GET /exhibitions/{exhibition_id}/booths
ブース一覧を取得

### POST /exhibitions/{exhibition_id}/booths
ブースを作成

### PUT /exhibitions/{exhibition_id}/booths/{id}
ブース情報を更新（出展社割当含む）

### GET /exhibitions/{exhibition_id}/booths/{id}
ブース詳細（関連ドキュメント・注文・設計仕様を含む）

**レスポンス: 200**
```json
{
  "data": {
    "id": "uuid",
    "booth_number": "A-12",
    "exhibitor": {
      "id": "uuid",
      "name": "株式会社サンプル"
    },
    "area_sqm": 18.0,
    "status": "assigned",
    "documents": [
      {
        "id": "uuid",
        "file_name": "注文書_サンプル社.xlsx",
        "document_category": "order",
        "status": "confirmed",
        "created_at": "2026-04-20T10:00:00Z"
      }
    ],
    "orders_summary": {
      "count": 2,
      "total_amount": 125000
    },
    "design_spec": {
      "id": "uuid",
      "width_mm": 6000,
      "depth_mm": 3000,
      "height_mm": 2700,
      "version": 2,
      "status": "confirmed"
    }
  }
}
```

---

## 5. ドキュメント API

### POST /documents/upload
ドキュメントをアップロード

**リクエスト:** multipart/form-data
| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| file | File | Yes | アップロードファイル |
| exhibition_id | UUID | Yes | 展示会ID |
| booth_id | UUID | No | ブースID |
| document_category | string | No | order / design / other |

**レスポンス: 201**
```json
{
  "data": {
    "id": "uuid",
    "file_name": "注文書.xlsx",
    "status": "received",
    "message": "ファイルを受信しました。AI解析を開始します。"
  }
}
```

### POST /documents/upload-batch
複数ファイルを一括アップロード

### GET /documents
ドキュメント一覧を取得

**クエリパラメータ:**
| パラメータ | 型 | 説明 |
|-----------|-----|------|
| exhibition_id | UUID | 展示会で絞り込み |
| booth_id | UUID | ブースで絞り込み |
| organization_id | UUID | 送信元組織で絞り込み |
| status | string | ステータスで絞り込み |
| document_category | string | カテゴリで絞り込み |
| source_channel | string | 受信チャネルで絞り込み |
| date_from | date | 受信日from |
| date_to | date | 受信日to |
| cursor | string | ページネーション |
| limit | integer | 取得件数 |

### GET /documents/{id}
ドキュメント詳細（AI解析結果含む）

**レスポンス: 200**
```json
{
  "data": {
    "id": "uuid",
    "file_name": "注文書_サンプル社.xlsx",
    "file_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "file_size_bytes": 45000,
    "source_channel": "web_upload",
    "document_category": "order",
    "status": "analyzed",
    "download_url": "https://...",
    "uploaded_by": {
      "organization": { "id": "uuid", "name": "株式会社サンプル" },
      "user": { "id": "uuid", "name": "田中太郎" }
    },
    "ai_analysis": {
      "id": "uuid",
      "confidence_score": 0.92,
      "review_status": "auto_approved",
      "structured_data": {
        "document_type": "order",
        "order_items": [ ... ],
        "total_amount": 62000
      },
      "processing_time_ms": 3200
    },
    "created_at": "2026-04-20T10:00:00Z"
  }
}
```

### GET /documents/{id}/download
原本ファイルをダウンロード（署名付きURL発行）

### DELETE /documents/{id}
ドキュメントを削除（論理削除）

---

## 6. AI解析 API

### POST /documents/{id}/reanalyze
ドキュメントを再解析

### GET /ai-analyses/review-queue
レビュー待ちの解析結果一覧

**クエリパラメータ:**
| パラメータ | 型 | 説明 |
|-----------|-----|------|
| exhibition_id | UUID | 展示会で絞り込み |
| confidence_below | decimal | 信頼度の上限 |
| cursor | string | ページネーション |

**レスポンス: 200**
```json
{
  "data": [
    {
      "id": "uuid",
      "document": {
        "id": "uuid",
        "file_name": "注文書_○○社.pdf",
        "download_url": "https://..."
      },
      "confidence_score": 0.65,
      "structured_data": { ... },
      "low_confidence_fields": ["unit_price", "delivery_date"],
      "created_at": "2026-04-20T10:05:00Z"
    }
  ]
}
```

### PUT /ai-analyses/{id}/review
解析結果をレビュー（承認/修正/却下）

**リクエストボディ:**
```json
{
  "action": "approve_with_corrections",
  "corrected_data": {
    "order_items": [
      {
        "item_name": "パネル（白） W900×H2400",
        "quantity": 10,
        "unit_price": 5500
      }
    ]
  },
  "notes": "単価を5000→5500に修正（税込表記のため）"
}
```

---

## 7. 注文 API

### GET /orders
注文一覧

### GET /orders/{id}
注文詳細（明細含む）

### PUT /orders/{id}
注文情報を更新

### GET /exhibitions/{id}/orders/summary
展示会の注文集計

**レスポンス: 200**
```json
{
  "data": {
    "total_orders": 95,
    "total_amount": 12500000,
    "by_category": [
      { "category": "パネル", "count": 340, "amount": 5100000 },
      { "category": "照明", "count": 280, "amount": 2800000 },
      { "category": "電気工事", "count": 95, "amount": 4600000 }
    ],
    "by_exhibitor": [
      { "exhibitor_name": "株式会社A", "booth": "A-01", "amount": 250000 },
      { "exhibitor_name": "株式会社B", "booth": "A-02", "amount": 180000 }
    ]
  }
}
```

---

## 8. 設計仕様 API

### GET /design-specs
設計仕様一覧

### GET /design-specs/{id}
設計仕様詳細

### PUT /design-specs/{id}
設計仕様を更新

---

## 9. 通知 API

### GET /notifications
通知一覧（自分宛て）

### PUT /notifications/{id}/read
既読にする

### PUT /notifications/read-all
全て既読にする

---

## 10. レポート API

### GET /exhibitions/{id}/reports/documents
ドキュメント提出状況レポート（CSV/Excel/PDF出力対応）

**クエリパラメータ:**
| パラメータ | 型 | 説明 |
|-----------|-----|------|
| format | string | csv / xlsx / pdf |

### GET /exhibitions/{id}/reports/orders
注文一覧レポート

### GET /exhibitions/{id}/reports/progress
進捗レポート

---

## 11. 検索 API

### GET /search
全文検索（Elasticsearch連携）

**クエリパラメータ:**
| パラメータ | 型 | 説明 |
|-----------|-----|------|
| q | string | 検索キーワード |
| exhibition_id | UUID | 展示会で絞り込み |
| type | string | document / order / design_spec |
| date_from | date | 日付from |
| date_to | date | 日付to |

---

## 12. Webhook API（メール・FAX受信用）

### POST /webhooks/inbound-email
メール受信Webhook（SES/SendGridから呼び出し）

### POST /webhooks/inbound-fax
FAX受信Webhook（FAXサービスから呼び出し）

### 処理フロー

```
メール受信
  │
  ▼
POST /webhooks/inbound-email
  │
  ├─ 送信元メールアドレスから組織を特定
  ├─ 件名・本文から展示会を推定
  ├─ 添付ファイルをS3に保存
  ├─ documentsレコードを作成
  └─ AI解析パイプラインをキック
```
