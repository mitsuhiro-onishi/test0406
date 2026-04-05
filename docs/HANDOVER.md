# セッション引き継ぎドキュメント

## プロジェクト概要

展示会ドキュメント管理システムを開発中。展示会の主催者・協力会社（装飾業者・電気会社・ケータリング等）が、出展社から届くさまざまな書類（注文書・設計書等）をAI（OCR + LLM）で自動解析し、構造化データとして一元管理するシステム。

### コンセプト
1. **出展社に既存ワークフローの変更を強いない** — 既存の書類をそのままアップロード
2. **AIがフォーマット差異を吸収** — OCR + Claude APIで自動解析
3. **主催者側は統一された構造化データを閲覧** — 管理ダッシュボードで確認

### 「提出カテゴリ」の仕組み
- 出展社は「電気申込」「コマ申込」「弁当注文」等のカテゴリを選んでアップロード
- 各カテゴリには受取先の協力会社が紐付いている（展示会ごとに設定可能）
- 出展社は会社名を意識せず、カテゴリ名だけ選べばよい

---

## 技術スタック

| レイヤ | 技術 |
|--------|------|
| フロントエンド | Next.js + TypeScript + MUI (Material UI) |
| バックエンド | FastAPI (Python) |
| DB | PostgreSQL |
| AI | Google Cloud Vision (OCR) + Claude API (LLM解析) |
| インフラ | Docker Compose（ローカル）→ GCP（Cloud Run, Cloud SQL）予定 |
| UIモック | 静的HTML（GitHub Pages でプレビュー） |

---

## リポジトリ構成

```
test0406/
├── index.html              ← 出展社ポータル（静的モック・完成済み）
├── admin.html              ← 管理者ダッシュボード（★未作成★）
├── screenshots/            ← Playwrightで撮ったUIスクリーンショット
├── docs/
│   ├── 00_requirements_definition.md  ← 要件定義
│   ├── 01_system_architecture.md      ← システム構成図
│   ├── 02_database_design.md          ← DB設計（13テーブル）
│   ├── 03_api_design.md               ← REST API設計
│   ├── 04_screen_design.md            ← 画面設計・ワイヤーフレーム
│   └── HANDOVER.md                    ← このファイル
├── backend/
│   └── app/
│       ├── main.py           ← FastAPIアプリ（CORS・自動マイグレーション）
│       ├── api/
│       │   ├── documents.py  ← アップロード・一覧・詳細API
│       │   ├── exhibitions.py← 展示会・提出カテゴリAPI
│       │   └── seed.py       ← テストデータ投入
│       ├── models/           ← SQLAlchemyモデル
│       ├── schemas/          ← Pydanticスキーマ
│       └── services/         ← ビジネスロジック
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── UploadFlow.tsx    ← 3ステップアップロードウィザード
│       │   └── DocumentList.tsx  ← ドキュメント一覧テーブル
│       └── lib/
│           └── mockData.ts      ← モックデータ
└── docker-compose.yml        ← PostgreSQL + FastAPI + Next.js
```

---

## gitブランチ

- **作業ブランチ**: `claude/event-document-management-XGp0J`
- pushコマンド: `git push -u origin claude/event-document-management-XGp0J`
- GitHub Pages URL: `https://mitsuhiro-onishi.github.io/test0406/`

---

## 完了済み作業

1. 要件定義書（docs/00）— FAX除外・カメラ撮影対応・提出カテゴリ概念を含む
2. システム構成書（docs/01）— AI解析パイプライン・開発フェーズ定義
3. DB設計書（docs/02）— 13テーブル（submission_categories含む）
4. API設計書（docs/03）— REST API・ロール定義（admin/organizer/exhibitor/partner/viewer）
5. 画面設計書（docs/04）— 18画面のワイヤーフレーム
6. バックエンド雛形 — FastAPI + SQLAlchemy + マイグレーション
7. フロントエンド雛形 — Next.js + MUI + モックデータ
8. **出展社ポータル（index.html）** — 完全インタラクティブな静的モック
   - 3ステップアップロード（ファイル選択→カテゴリ選択→確認・送信）
   - ドラッグ&ドロップ、カメラ撮影対応
   - アップロードシミュレーション（プログレス→完了→テーブルに反映）
   - GitHub Pages でプレビュー可能
9. UIスクリーンショット7枚（screenshots/）

---

## ★ 次にやるべき作業（優先順）

### 1. admin.html の作成（最優先・未着手）

管理者向けダッシュボードの静的HTMLモック。index.htmlと同じスタイル（Google Fonts + Material Icons CDN、vanilla JS）で作成する。

**含めるべき4画面**（タブ切り替えで1ファイルに収める）:

| タブ | 画面 | 内容 | 参照 |
|------|------|------|------|
| 1 | ダッシュボード (S-02) | サマリーカード（受信数・解析済・要レビュー・確認済）、アクティビティフィード、提出カテゴリ別進捗バー | docs/04 S-02 |
| 2 | ドキュメント一覧 (S-07) | フィルタ付きテーブル（展示会・ステータス・カテゴリ・受信方法・期間）、ページネーション | docs/04 S-07 |
| 3 | AIレビュー (S-10) | 左右分割（原本プレビュー / AI解析結果）、信頼度スコア、低信頼度フィールドのハイライト、承認/却下ボタン | docs/04 S-10 |
| 4 | カテゴリ管理 (S-14) | カテゴリ一覧テーブル（カテゴリ名・受取先・必須/任意・期限・提出率）、追加/編集/コピーボタン | docs/04 S-14 |

**スタイル方針**:
- AppBarの色は `#1565c0`（index.htmlの `#1976d2` より少し暗く、管理者用と区別）
- 左サイドメニュー（PC時はデスクトップ幅、モバイル時は折りたたみ）
- index.htmlへのリンクを含める（「出展社ポータルを見る」）

### 2. 残りの開発タスク一覧

| # | タスク | 概要 | 優先度 |
|---|--------|------|--------|
| A | admin.htmlの作成 | 上記参照 | 最優先 |
| B | 認証・認可 | ログイン画面、JWT、ロール別アクセス制御 | 高 |
| C | バックエンドAPI結合 | フロントエンドをモックデータから実APIへ切り替え | 高 |
| D | ファイルアップロードAPI | 実際のファイル保存（ローカル→GCS） | 高 |
| E | AI解析パイプライン | Cloud Vision OCR → Claude API解析 → 構造化データ保存 | 高 |
| F | 信頼度スコアリング | AI解析結果の信頼度算出・低信頼度フラグ | 中 |
| G | レビューワークフロー | 要レビュー→承認/却下/修正のフロー実装 | 中 |
| H | 通知機能 | 新着ドキュメント・レビュー依頼の通知 | 中 |
| I | 協力会社ポータル | partner.html または専用画面（自社宛ドキュメントのみ表示） | 中 |
| J | CSV/レポート出力 | 注文集計のCSVエクスポート | 低 |
| K | メール受信（Phase 2） | メールでの書類受付 | 低 |
| L | GCPデプロイ | Cloud Run + Cloud SQL + Cloud Storage | 低（環境準備後） |

---

## ユーザーの特徴・注意事項

- **スマホから確認することが多い** — GitHub PagesのURLで確認。ローカルサーバーは不可
- **利用者のITリテラシーは低い** — Googleサービスっぽい見た目（MUI）を採用した理由
- **FAXは除外** — 受信方法はWebアップロードのみ（Phase 2でメール追加）
- **静的モックを先に見せてからフィードバック** — いきなり動的実装より、まずHTMLモックで確認
- **日本語で会話** — 日本語で応答すること

---

## GitHub Pages 設定

- リポジトリ Settings → Pages → Deploy from a branch で有効化済み
- ブランチ: `claude/event-document-management-XGp0J` / root
- URL: `https://mitsuhiro-onishi.github.io/test0406/`
- `index.html` → 出展社ポータル
- `admin.html` → 管理者ダッシュボード（作成後に自動反映）
