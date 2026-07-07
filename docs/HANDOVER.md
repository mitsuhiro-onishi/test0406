# セッション引き継ぎドキュメント（2026-07-08更新・4回目）

> 2026-07-08の追加実装: ユーザー管理画面＋design_specs＋複数展示会UI（指示書01）＋一括アップロードAPI（指示書02）。
> 残タスクは docs/指示書/ に設計確定済み（Sonnet 5単独で実装可能な粒度）。

## プロジェクト概要

**DOSL HUB** — 展示会ドキュメント管理システム。
出展社が「電気申込」「弁当注文」等の提出カテゴリを選んで既存書類をそのままアップロードすると、AI（Claude）がフォーマット差異を吸収して構造化データ化し、主催者・協力会社（装飾業者・電気会社・ケータリング等）がダッシュボードで一元管理する。

### コンセプト
1. **出展社に既存ワークフローの変更を強いない** — 既存の書類をそのままアップロード
2. **AIがフォーマット差異を吸収** — Claudeのvision/テキスト解析で自動構造化
3. **主催者側は統一された構造化データを閲覧** — 管理ダッシュボードで確認・承認

---

## 現在の状態: GCP本番公開済み ✅（2026-07-08）

**公開URL: https://34-168-97-181.sslip.io/login.html**

- GCPプロジェクト `dosl-hub-01`・VM `dosl-hub`（e2-micro・us-west1-b・固定IP・約1,500円/月）
- Caddy自動HTTPS（sslip.io）＋systemd常時稼働。AEOツールと同構成
- 実AI解析（claude-sonnet-5）本番動作確認済み（アップロード→解析0.96→自動承認→注文生成→管理画面反映を実ブラウザ検証）
- 本番のログインパスワードはリポジトリ外: `本番ログイン情報.txt`（このMacのみ・git管理外）
- 運用・再デプロイ手順: **deploy/公開手順_GCP.md**（ランブック）／VM構築: deploy/vm_setup.sh
- 本番準備3点は実施済み: SECRET_KEY生成（VM .envのみ）・ENABLE_SEED=false（/api/seedは404）・デモパスワード無効化（SEED_PASSWORD上書きで全アカウント作成）

2026-07-07に実装フェーズを完了。静的モックだった画面が実システムになった。

### 動いている機能（実ブラウザE2E検証済み）
- **認証**: JWTログイン、ロール別アクセス制御（admin/organizer/exhibitor/partner/viewer）
- **出展社ポータル** (index.html): 3ステップアップロード（D&D・カメラ撮影対応）→実保存→解析状況の自動更新表示
- **AI解析パイプライン**: アップロード→バックグラウンド解析→構造化データ＋信頼度スコア保存
  - 信頼度 ≥0.85 → 自動承認＋注文データ自動生成
  - 信頼度 <0.85 → レビュー待ちキューへ
- **管理ダッシュボード** (admin.html): サマリー統計・カテゴリ別提出率・受信フィード／書類一覧（フィルタ・検索・ページネーション・詳細・原本DL・再解析）／**AIレビュー画面**（原本プレビュー+解析結果の左右比較、品目編集、承認・修正して承認・差し戻し）／注文集計（出展社別金額・一覧）／カテゴリ管理CRUD／通知（ベル・未読バッジ）
- **権限分離**: 出展社=自社の書類のみ／協力会社=自社宛カテゴリのみ／主催者=全件
- **ユーザー管理（2026-07-08追加）**: 管理画面「ユーザー管理」タブ。組織CRUD＋ユーザー作成（初期PW自動発行・一度だけ表示）／編集／無効化／PW再発行。自分自身の無効化・降格は不可
- **設計仕様（2026-07-08追加）**: ブース設営・図面系書類のAI解析からdesign_specs自動生成（寸法mm・素材・電気要件・版管理）。管理画面「設計仕様」タブでブース別に閲覧・修正・確定。partnerは自社宛のみ
- **複数展示会UI（2026-07-08追加・指示書01）**: 展示会の作成/編集API（`POST /api/exhibitions`・`PATCH /api/exhibitions/{id}`、require_manager、status=preparing/active/closed）＋ヘッダーの展示会セレクタで切替（選択は `localStorage['doslhub_exhibition_id']` に保持）。managerはセレクタ横の歯車から「展示会を管理」（一覧・新規作成・編集。新規作成時に既存展示会からカテゴリコピー可）。index.html（出展社）もセレクタ対応（closedは非表示・2件以上のときだけ表示）。出展社の書類一覧は展示会でフィルタするようになった
- **一括アップロードAPI（2026-07-08追加・指示書02）**: `POST /api/documents/bulk-upload`（files複数・上限20・失敗ファイルがあっても他は保存し `{data:[{file_name,ok,id|error}]}` を200で返す）。保存ロジックは `_save_one` に共通化（単一版 `/upload` も同じ関数を使用・後方互換で残置）。index.htmlの送信は直列ループ→一括1リクエストに変更。失敗ファイルは選択リストに理由つき赤字で残り、成功分だけ解析ポーリングへ進む
- **CSV出力**: 注文一覧（品目明細つき）・書類提出状況（BOM付きUTF-8）
- **出展申込（2026-07-07追加・オプション機能）**: 展示会ごとにON/OFF可能なセルフサービス申込
  - 公開フォーム `apply.html?exhibition=<id>`（認証不要）→ 申込→主催者に通知
  - 管理画面「出展申込」タブ: 受付ON/OFFトグル・申込ページURLコピー・一覧（状態フィルタ）・承認/却下
  - 承認すると organization（出展社）+ user（担当者アカウント）+ booth（任意）を自動作成し、
    初期パスワードを一度だけ画面表示（メール送信はPhase 2で自動化予定）
  - バリデーション: 受付OFF時403・審査中の同一メール重複409・既存ユーザーemail409・不正email400
  - API: `/api/public/exhibitions/{id}/application-info`・`/api/public/exhibitions/{id}/applications`（公開）、
    `/api/exhibitions/{id}/applications`・`/api/applications/{id}/approve|reject`・
    `/api/exhibitions/{id}/application-settings`（require_manager）

### 起動方法
```bash
./run_dev.sh          # → http://localhost:8710/login.html
# 初回のみシードデータ投入:
curl -X POST http://localhost:8710/api/seed
```
DBはSQLite（backend/exhibition.db）。ファイルはbackend/uploads/に保存。

※ /api/seed は環境変数 ENABLE_SEED=true のときだけ有効（run_dev.shが自動設定）。
本番ではデフォルト無効＝404になる（デモアカウントのパスワードがリポジトリ公開のため）。

### デモアカウント（パスワードはseed.py参照）
| ロール | メール | 見えるもの |
|--------|--------|-----------|
| admin | admin@dosl-hub.example.com | 全部＋レビュー承認 |
| organizer | organizer@dosl-hub.example.com | 全部＋レビュー承認 |
| exhibitor | exhibitor-a@dosl-hub.example.com | 自社の提出書類のみ |
| partner | electric@dosl-hub.example.com | 電気申込の書類のみ |

### AI解析プロバイダ（backend/app/services/ai_analyzer.py）
| プロバイダ | 用途 | 設定 |
|-----------|------|------|
| anthropic | **本番**。PDF/画像はvision、Excel/Wordはテキスト抽出→解析 | backend/.env に `ANTHROPIC_API_KEY=sk-...` |
| mock | デモ・開発（APIキー不要、決定的） | キーが無ければautoでこれになる |
| claude_cli | ローカルのclaudeコマンド利用 | `AI_PROVIDER=claude_cli`（※Claude Codeセッション内からの起動では認証が通らないことを確認済み。通常のターミナルで`claude login`済みなら動く可能性あり） |

ファイル名に「手書き」「低画質」を含むファイルをアップすると、mockが低信頼度(0.62)を返しレビューフローをデモできる。

---

## アーキテクチャ（2026-07-07時点の実装）

| レイヤ | 技術 | 備考 |
|--------|------|------|
| フロント | **静的HTML+vanilla JS**（web/） | FastAPIが同一オリジンで配信。Next.js(frontend/)は使用停止（残置） |
| バックエンド | FastAPI (Python 3.14, backend/.venv) | |
| DB | **SQLite（ローカル）/ PostgreSQL（本番想定）** | sqlalchemy.Uuid+JSON型でクロスダイアレクト。DATABASE_URLで切替 |
| AI | Claude API（vision+テキスト） | Cloud Vision OCRは不採用（Claude単体でOCR+構造化） |
| 認証 | JWT (PyJWT) + bcrypt | |

### 設計docsからの主な変更
- フロントはNext.js→静的HTML直配信に変更（モック完成度が高く、単一サーバーで完結するため）
- OCRはGoogle Cloud Vision→Claude visionに一本化（credential1種で済む）
- ページネーションはcursor→offset方式
- カテゴリ削除は書類が紐づく場合「無効化」にフォールバック

### 主要ファイル
```
backend/app/
  core/security.py           JWT・パスワード・ロール依存（require_manager等）
  services/ai_analyzer.py    AI解析パイプライン（プロバイダ3種）
  services/order_builder.py  承認済み解析→orders/order_items生成
  api/auth.py documents.py exhibitions.py reviews.py orders.py notifications.py seed.py
  api/applications.py        出展申込（公開+管理）
  models/exhibitor_application.py  出展申込モデル
web/
  login.html index.html(出展社) admin.html(管理) app.js(共通APIクライアント)
  apply.html                 出展申込の公開フォーム（?exhibition=<id>必須）
test_documents/              実AI解析テスト書類3種＋run_real_ai_test.sh
run_dev.sh                   起動スクリプト（ENABLE_SEED=true自動設定）
```

### ローカル環境の状態（このMac固有・gitに含まれない）
- backend/.env に ANTHROPIC_API_KEY 設定済み（実AI解析が有効。git管理外）
- backend/exhibition.db に accepting_applications カラムをALTER済み
  （新規DBなら create_all で自動作成されるので対応不要）
- ローカルDBには実AIテストの書類・出展申込テストデータ（ナニワ精密機械・大和路金属工業等）が入っている

---

## 残タスク（本番化に向けて）

| # | タスク | 備考 |
|---|--------|------|
| 1 | ~~実AI解析の動作確認~~ | ✅ **2026-07-07完了**。下記「実AI解析テスト結果」参照 |
| 2 | ~~GCPデプロイ~~ | ✅ **2026-07-08完了**。dosl-hub-01/e2-micro/Caddy+sslip.io。本番準備3点（SECRET_KEY・ENABLE_SEED・デモパスワード）も実施済み。運用はdeploy/公開手順_GCP.md参照 |
| 3 | ファイル保存のGCS化 | **設計確定済→docs/指示書/03**。書類が増えたら実施 |
| 4 | ~~複数展示会UI~~ | ✅ **2026-07-08完了**（指示書01）。作成/編集API＋セレクタ切替＋管理ダイアログ＋カテゴリコピー。テストDBで実ブラウザ検証済み・本番反映済み |
| 5 | ~~ユーザー管理画面~~ | ✅ **2026-07-08完了**。組織・ユーザーCRUD＋PW再発行（admin_users.py＋admin.html「ユーザー管理」タブ）。本番反映済み |
| 6 | ~~design_specs（設計仕様）~~ | ✅ **2026-07-08完了**。ブース設営書類→寸法/素材/電気要件を自動抽出・版管理・「設計仕様」タブ。本番で実AI検証済み（3m→3000mm換算も正確） |
| 7 | メール受信 (Phase 2) | **設計確定済→docs/指示書/04**（Gmail APIポーリング方式）。着手前にメールアドレスの用意を大西さんに確認 |
| 8 | ~~一括アップロードAPI~~ | ✅ **2026-07-08完了**（指示書02）。bulk-upload＋部分失敗対応＋UI一括化。テストDBで実ブラウザ検証済み・本番反映済み |

**残タスクはすべて docs/指示書/ に設計確定済みの実装指示書あり（Sonnet 5が単独で実装できる粒度）。README.mdの共通ルールから読むこと。**

### 実AI解析テスト結果（2026-07-07・claude-sonnet-5）

backend/.env に ANTHROPIC_API_KEY 設定済み（git管理外を確認済み）。テスト書類と一括テストスクリプトは test_documents/ に恒久保存。

| 書類 | 形式 | 信頼度 | 振り分け | 抽出精度 |
|------|------|--------|----------|----------|
| 電気工事申込書（活字きれい） | PDF | 0.97 | 自動承認→注文生成 | 会社名・ブース・4品目・合計80,200円・納期すべて正確 |
| 弁当注文書（手書き風・傾き・ぼかし） | PNG | 0.55 | レビュー待ち | 曖昧箇所（行ズレ・空欄・「くらい？」表記）を注記に正確に列挙 |
| 備品レンタル申込書 | Excel | 0.90 | 自動承認→注文生成 | 4品目・合計32,400円正確。年の推定に注記あり |

- 実ブラウザでAIレビュー画面（原本プレビュー＋要確認フィールド強調）の表示も確認済み
- トークン消費: 3書類で入力5,175/出力2,813トークン（1書類あたり数円程度）
- 再テスト: `./test_documents/run_real_ai_test.sh`（アップロード→ポーリング→結果一覧まで自動）

### 既知の注意点
- モバイルSafariでのカメラ撮影は実機未検証（capture属性実装済み・指示書05の5-5）
- ~~解析失敗と差し戻しの混在~~ → 2026-07-08解消（解析失敗はstatus="analysis_failed"に分離・「解析失敗」表示・再解析で復旧）
- ~~通知がポーリングしない~~ → 2026-07-08解消（1分間隔・タブ非表示時はスキップ）

### 指示書05（小粒改善）の消化状況（2026-07-08）
- ✅ 5-1 通知ポーリング／✅ 5-2 解析失敗の分離（CSV・サマリーAPIにもanalysis_failed追加）／
  ✅ 5-3 レビュー画面にdesign_spec読み取り専用カード／✅ 5-6 監査ログ（services/audit.py・
  レビュー承認/差し戻し・ユーザー作成/無効化/PW再発行・組織削除の5操作を記録）
- ⏳ 5-4 初期パスワードのメール送信（04のGmail運用決定待ち）／⏳ 5-5 モバイルSafari実機検証（iPhoneが必要）

---

## ユーザーの特徴・注意事項（変わらず有効）
- **スマホから確認することが多い** — レスポンシブ対応済み（ハンバーガーメニュー）
- **利用者のITリテラシーは低い** — Googleサービス風の見た目を維持
- **FAXは除外** — Webアップロード＋カメラ撮影のみ
- **日本語で会話**

## gitブランチ
- 作業ブランチ: `exhibition/document-management`（worktree: exhibition-systems/document-management/）
- push先: `mitsuhiro-onishi/test0406`（※pushは外部反映のため要確認）
- GitHub Pagesの旧モックURLは web/ 移動により無効（実サーバー配信に移行）
