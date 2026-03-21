# DOSL 展示会管理システム — 要件定義書

## 1. システム概要

| 項目 | 内容 |
|------|------|
| システム名 | DOSL Exhibition System |
| 種別 | マルチテナント型 展示会 事前登録・受付チェックインシステム |
| フロントエンド | Next.js 14 / React 18 / Tailwind CSS |
| バックエンド | Next.js API Routes / Supabase (PostgreSQL) |
| 認証 | Supabase Auth（メール+パスワード）/ httpOnly Cookie |
| QRコード | qrcode（生成）/ html5-qrcode（読取） |
| メール送信 | Resend API |

---

## 2. ユーザー種別

| 種別 | アクセス範囲 |
|------|-------------|
| **一般来場者**（匿名） | 事前登録フォーム、QRチケット表示 |
| **管理者 (owner)** | 全展示会の管理・設定 |
| **管理者 (admin)** | 全展示会の管理 |
| **スタッフ (staff)** | 割り当てられた展示会のみ |

---

## 3. 画面一覧

### 3.1 公開画面（認証不要）

| 画面 | パス | 機能 |
|------|------|------|
| 事前登録フォーム | `/{slug}/register` | 展示会ごとの来場者登録 |
| QRチケット表示 | `/{slug}/ticket/{code}` | QRコード・チケット情報の表示 |

### 3.2 管理画面（認証必須）

| 画面 | パス | 機能 |
|------|------|------|
| ログイン | `/admin/login` | メール+パスワード認証 |
| ダッシュボード | `/admin/dashboard` | 統計サマリー・展示会一覧 |
| 登録者一覧 | `/admin/registrations` | 検索・フィルター・編集・CSV・メール送信 |
| 受付チェックイン | `/admin/checkin` | QRカメラ読取 / 手動入力 |

---

## 4. 事前登録機能

### 4.1 登録フォーム項目

| フィールド | 必須 | 表示制御 | 備考 |
|-----------|------|---------|------|
| メールアドレス | **必須** | 常時表示 | 一意キー（小文字正規化） |
| 姓 | **必須** | 常時表示 | |
| 名 | **必須** | 常時表示 | |
| セイ（カナ） | 任意 | 常時表示 | |
| メイ（カナ） | 任意 | 常時表示 | |
| 登録種別 | **必須**（種別がある場合） | 常時表示 | 展示会ごとに設定 |
| 会社名 | 設定依存 | `form_fields.company_name` | visible/required 設定可 |
| 会社名カナ | 設定依存 | `form_fields.company_kana` | |
| 部署 | 設定依存 | `form_fields.department` | |
| 役職 | 設定依存 | `form_fields.position` | |
| 電話番号 | 設定依存 | `form_fields.phone` | |
| 郵便番号 | 設定依存 | `form_fields.postal_code` | デフォルト非表示 |
| 住所 | 設定依存 | `form_fields.address` | デフォルト非表示 |
| 業種 | 設定依存 | `form_fields.industry` | ドロップダウン（`industry_options`から選択） |
| 来場目的 | 設定依存 | `form_fields.visit_purpose` | 複数選択（`purpose_options`から選択） |
| 同伴者 | 設定依存 | `form_fields.companions` | 最大4名（`companions.max`で変更可）|
| セミナー申込 | 設定依存 | `features.seminar` | 複数選択、seminar_bookingsに記録 |

### 4.2 登録処理フロー

```
1. バリデーション（必須項目チェック）
2. 展示会の存在・公開状態チェック（status = 'published'）
3. 登録上限チェック（max_registrations）
4. 来場者の UPSERT（emailで一意判定）
5. 重複登録チェック → 既存なら既存チケットコードを返却
6. チケットコード生成（DB関数: 8文字英数字）
7. 登録レコード作成（status = 'confirmed'）
8. セミナー予約作成（seminar_ids指定時）
9. 確認メール送信（非同期・失敗しても登録は成功）
10. チケットコード・登録IDを返却
```

### 4.3 チケットコード仕様

- 8文字の英数字（大文字）
- 使用文字: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`（0/O、1/I/L を除外）
- DB関数 `generate_ticket_code()` で暗号学的に安全に生成

### 4.4 登録完了画面

- チケットコードの大文字表示
- QRチケット表示ページへのリンク

---

## 5. QRチケット表示

| 項目 | 内容 |
|------|------|
| QRコード | ticket_codeをエンコード（300px, 誤り訂正レベルM） |
| チケットコード | 8文字モノスペース表示 |
| 来場者情報 | 氏名、会社名、登録種別バッジ、ステータス |
| 展示会情報 | 名称、開催日、会場名 |
| デザイン | 展示会のブランディングカラー適用 |
| アクセス制御 | チケットコードがアクセストークン（認証不要） |

---

## 6. 管理者認証

### 6.1 ログインフロー

```
1. メール + パスワードで Supabase Auth 認証
2. admin_users テーブルで権限チェック（is_active = true）
3. httpOnly Cookie にセッション保存
   - sb-access-token: 24時間
   - sb-refresh-token: 7日間
4. 管理画面へリダイレクト
```

### 6.2 セッション管理

- サーバーコンポーネントで `requireAdmin()` を呼び出し
- 未ログイン時は `/admin/login` へ自動リダイレクト
- admin layout（force-dynamic）でチェック

---

## 7. ダッシュボード

### 7.1 サマリーカード

| カード | 内容 |
|--------|------|
| 展示会数 | 全展示会の件数 |
| 総登録者数 | 全展示会の confirmed 登録数合計 |
| 総入場者数 | 全展示会のチェックイン数合計 |

### 7.2 展示会一覧テーブル

| 列 | 内容 |
|----|------|
| 展示会名 | 名称 + slug |
| 開催期間 | start_date 〜 end_date |
| ステータス | 下書き / 公開中 / 終了 / アーカイブ（色分けバッジ） |
| 登録数 | confirmed数 / max_registrations（上限設定時） |
| 入場数 | entry_logs の entry 件数 |

---

## 8. 登録者管理

### 8.1 一覧表示

**テーブル列:**
チケットコード、氏名（かな）、会社名、メール、登録種別、ステータス、登録日、操作

**展開行（行クリック）:**
部署、役職、電話番号、業種、来場目的、同伴者（人数・名前）、住所

### 8.2 検索・フィルター

| 機能 | 仕様 |
|------|------|
| テキスト検索 | 氏名・会社名・メールアドレスで横断検索（300msデバウンス） |
| 展示会フィルター | ドロップダウンで展示会選択 |
| ステータスフィルター | 全ステータス / 登録済 / キャンセル / ウェイトリスト |
| ページネーション | 50件/ページ、前へ/次へ |

### 8.3 編集機能（モーダル）

**編集可能項目:**

| フィールド | 編集可否 | 備考 |
|-----------|---------|------|
| ステータス | **可** | confirmed / cancelled / waitlisted |
| 姓・名 | **可** | |
| セイ・メイ | **可** | |
| メールアドレス | **不可** | 一意キーのため読取専用 |
| 会社名 | **可** | |
| 部署 | **可** | |
| 役職 | **可** | |
| 電話番号 | **可** | |
| 業種 | **可** | |
| 郵便番号 | **可** | |
| 住所 | **可** | |

### 8.4 CSVダウンロード

| 項目 | 内容 |
|------|------|
| エンコーディング | UTF-8 + BOM（Excel対応） |
| ファイル名 | `registrations_YYYY-MM-DD.csv` |
| フィルター反映 | 検索・展示会・ステータスの条件をそのまま反映 |

**CSV列（19列）:**
チケットコード、ステータス、姓、名、セイ、メイ、メールアドレス、会社名、部署、役職、電話番号、郵便番号、住所、業種、来場目的、登録種別、同伴者、展示会、登録日時（JST）

### 8.5 操作ボタン

| ボタン | 機能 |
|--------|------|
| 編集 | 編集モーダルを開く |
| 通知 | 確認メールを個別送信（確認ダイアログ付き） |

---

## 9. 受付チェックイン

### 9.1 入力モード

| モード | 機能 |
|--------|------|
| QRカメラ | スマホ/PCのカメラでQRコード読取。背面カメラ自動選択、カメラ切替対応 |
| 手動入力 | チケットコードを手打ち（8文字、大文字自動変換） |

### 9.2 チェックイン処理フロー

```
1. ticket_code で登録情報を検索
2. ステータスチェック（cancelled → エラー）
3. 最新の entry_log を確認
   - 最後が 'entry' → already_entered = true（再入場）
   - 最後が 'exit' or ログなし → already_entered = false（初入場）
4. entry_log を INSERT（action='entry', method='qr'/'manual'）
5. 結果を返却
```

### 9.3 結果表示

| 状態 | 表示 |
|------|------|
| 初入場 | 緑色ボーダー、氏名・会社名・種別バッジ・同伴者 |
| 再入場 | 黄色ボーダー、「再入場（既に入場済み）」表示 |
| エラー | 赤色ボーダー、エラーメッセージ |

### 9.4 重複スキャン防止

- 同一QRコードの連続読取を3秒間ブロック

### 9.5 チェックイン履歴

- 直近50件を画面下部に表示
- チケットコード、氏名、会社名、種別、再入場バッジ

---

## 10. メール送信

### 10.1 送信トリガー

| トリガー | タイミング | 備考 |
|---------|----------|------|
| 自動送信 | 事前登録完了時 | 非同期・失敗しても登録は成功扱い |
| 手動送信（通知ボタン） | 管理画面の登録者一覧から | 確認ダイアログ付き |
| 手動送信（編集モーダル） | 編集モーダル内のリンクから | 確認ダイアログ付き |

### 10.2 メールテンプレート

- **件名:** 【{展示会名}】事前登録完了のお知らせ
- **差出人:** {展示会名} <{EMAIL_FROM}>
- **形式:** HTML

**メール構成:**
1. ヘッダー: 展示会名、開催期間、会場名（ブランディングカラー背景）
2. 宛名: {姓} {名} 様
3. 本文: 登録お礼メッセージ
4. チケットコードブロック（大文字モノスペース）
5. QRチケット表示ボタン（リンク付き）
6. 登録情報テーブル（氏名、会社名、メール）
7. フッター: 受付案内、コピーライト

### 10.3 必要な環境変数

| 変数 | 必須 | 説明 |
|------|------|------|
| `RESEND_API_KEY` | メール送信時 | 未設定の場合メール機能は無効 |
| `NEXT_PUBLIC_BASE_URL` | メール送信時 | チケットURLの生成に使用 |
| `EMAIL_FROM` | 任意 | デフォルト: `noreply@exhibition.example.com` |

---

## 11. 展示会設定（exhibitions テーブル）

### 11.1 基本情報

| フィールド | 型 | 説明 |
|-----------|------|------|
| name | text | 展示会名 |
| slug | text (UNIQUE) | URLスラッグ |
| description | text | 説明文 |
| status | text | draft / published / closed / archived |
| start_date, end_date | date | 開催期間 |
| venue_name, venue_address | text | 会場情報 |
| max_registrations | int | 登録上限（NULLで無制限） |

### 11.2 ブランディング設定 (`branding` JSONB)

```json
{
  "primary_color": "#4a90d9",
  "secondary_color": "#6db0f0",
  "logo_url": null,
  "banner_url": null,
  "copyright": null
}
```

### 11.3 機能フラグ (`features` JSONB)

| フラグ | デフォルト | 現状 |
|--------|----------|------|
| seminar | false | **実装済** — セミナー選択・予約 |
| companion | true | **実装済** — 同伴者登録 |
| entry_number | false | **未実装（UI未対応）** |
| badge_print | false | **未実装（UI未対応）** |
| exit_tracking | false | **未実装（UI未対応）** |

### 11.4 フォームフィールド設定 (`form_fields` JSONB)

各フィールドの `{ visible: boolean, required: boolean }` を制御。
展示会ごとにフォームの表示項目をカスタマイズ可能。

### 11.5 選択肢設定

| 設定 | デフォルト値 |
|------|------------|
| `industry_options` | 製造業, 建設業, 卸売業, 小売業, 飲食業, サービス業, IT・通信, 不動産業, 運輸業, 金融・保険業, 医療・福祉, 教育, 官公庁・団体, その他 |
| `purpose_options` | 情報収集, 商談・取引, 技術調査, 新製品確認, その他 |

---

## 12. データベース構成

### 12.1 テーブル一覧

| テーブル | 説明 |
|---------|------|
| organizations | 組織（マルチテナント） |
| exhibitions | 展示会 |
| registration_types | 登録種別（一般/VIP/プレス等） |
| visitors | 来場者（emailで一意） |
| registrations | 登録情報（exhibition × visitor で一意） |
| entry_logs | 入退場ログ |
| seminars | セミナー |
| seminar_bookings | セミナー予約 |
| admin_users | 管理者ユーザー |
| invitation_codes | 招待コード |

### 12.2 ビュー

| ビュー | 説明 |
|--------|------|
| v_exhibition_stats | 展示会ごとの登録数・入場数集計 |
| v_seminar_stats | セミナーごとの予約数・チェックイン数集計 |

### 12.3 DB関数

| 関数 | 説明 |
|------|------|
| generate_ticket_code() | 8文字チケットコード生成 |
| update_updated_at() | updated_at 自動更新トリガー |

---

## 13. API一覧

| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/api/register` | 事前登録 |
| POST | `/api/checkin` | チェックイン処理 |
| GET | `/api/registrations` | 登録者一覧（検索・フィルター・ページネーション） |
| GET | `/api/registrations/csv` | CSV エクスポート |
| GET | `/api/registrations/[id]` | 登録情報詳細取得 |
| PATCH | `/api/registrations/[id]` | 登録情報更新 |
| GET | `/api/exhibitions` | 展示会一覧 |
| POST | `/api/auth/login` | 管理者ログイン |
| POST | `/api/auth/logout` | 管理者ログアウト |
| POST | `/api/email/confirmation` | 確認メール送信 |

---

## 14. 環境変数一覧

| 変数 | 用途 | 必須 |
|------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL | **必須** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 匿名キー | **必須** |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase サービスキー | **必須** |
| `NEXT_PUBLIC_BASE_URL` | サイトのベースURL | メール送信時必須 |
| `RESEND_API_KEY` | Resend APIキー | メール送信時必須 |
| `EMAIL_FROM` | 送信元メールアドレス | 任意 |

---

## 15. 未実装・今後の検討事項

| 機能 | 現状 | 備考 |
|------|------|------|
| 展示会の作成・編集UI | **未実装** | 現在はDB直接操作のみ |
| 入場番号 (entry_number) | スキーマのみ | features.entry_number フラグあり |
| バッジ印刷 | スキーマのみ | features.badge_print フラグあり |
| 退場トラッキング | スキーマのみ | features.exit_tracking フラグあり、entry_logsに'exit'対応済 |
| 招待コード運用 | スキーマのみ | invitation_codesテーブルあり、UIは未実装 |
| セミナー管理UI | **未実装** | 登録フォームでの選択のみ対応 |
| リマインダーメール | **未実装** | email_settings.reminder_enabled フラグあり |
| 管理者ユーザー管理UI | **未実装** | admin_usersのCRUD |
| 組織管理UI | **未実装** | organizationsのCRUD |
| API認証チェック | **未実装** | API routes にadminチェックなし（画面はlayoutで保護） |
| 登録者の削除 | **未実装** | 編集のみ対応 |
