# DOSL Exhibition Registration System

## SaaS コンセプト

展示会ごとにスクラッチで作らない。1つのシステムで複数展示会を管理する。

```
┌─────────────────────────────────────────────┐
│          DOSL Registration Platform          │
│                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ダイマツ   │ │展示会B   │ │展示会C   │    │
│  │フェア2026 │ │         │ │         │    │
│  └──────────┘ └──────────┘ └──────────┘    │
│         ↓            ↓           ↓          │
│  ┌─────────────────────────────────────┐    │
│  │     共通コア（フォーム・QR・受付）    │    │
│  └─────────────────────────────────────┘    │
│         ↓                                    │
│  ┌─────────────────────────────────────┐    │
│  │         Supabase (PostgreSQL)        │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

## 技術スタック

| レイヤー | 技術 | 理由 |
|---------|------|------|
| フロントエンド | Next.js 14 (App Router) + TypeScript | SSR/SSG対応、型安全 |
| スタイリング | Tailwind CSS | 高速UI開発、テーマカスタマイズ容易 |
| BaaS | Supabase | PostgreSQL、RLS、Auth、Realtime |
| QRコード生成 | qrcode (npm) | サーバーサイドでSVG/PNG生成 |
| QRコード読取 | html5-qrcode | カメラベースのブラウザ読取 |
| メール送信 | Supabase Edge Functions + Resend | トランザクションメール |
| デプロイ | Vercel | Next.jsとの親和性 |

## ディレクトリ構成

```
dosl-exhibition-system/
├── supabase/
│   ├── migrations/          # DBマイグレーション（SQL）
│   │   └── 001_initial.sql
│   ├── seed.sql             # 初期データ
│   └── config.toml          # Supabase設定
│
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── (public)/        # 来場者向け（認証不要）
│   │   │   ├── [slug]/      # 展示会ごとのURL /daimatsu-fair-2026
│   │   │   │   ├── register/    # 事前登録フォーム
│   │   │   │   ├── confirm/     # 登録確認
│   │   │   │   └── ticket/      # QRチケット表示
│   │   │   └── layout.tsx
│   │   │
│   │   ├── (admin)/         # 管理者向け（認証必要）
│   │   │   ├── dashboard/       # ダッシュボード
│   │   │   ├── exhibitions/     # 展示会管理
│   │   │   ├── registrations/   # 登録者一覧
│   │   │   ├── checkin/         # 受付（QR読取）
│   │   │   └── layout.tsx
│   │   │
│   │   ├── api/             # API Routes
│   │   │   ├── register/
│   │   │   ├── checkin/
│   │   │   └── export/
│   │   │
│   │   ├── layout.tsx
│   │   └── page.tsx
│   │
│   ├── components/          # UIコンポーネント
│   │   ├── ui/              # 汎用UI（Button, Input等）
│   │   ├── forms/           # フォーム関連
│   │   ├── qr/              # QR生成・読取
│   │   └── admin/           # 管理画面用
│   │
│   ├── lib/                 # ユーティリティ
│   │   ├── supabase/        # Supabaseクライアント
│   │   ├── qr.ts            # QRコード生成
│   │   ├── email.ts         # メール送信
│   │   └── validation.ts    # バリデーション
│   │
│   └── types/               # TypeScript型定義
│       ├── database.ts      # DB型（Supabase生成）
│       └── index.ts
│
├── public/                  # 静的ファイル
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.js
```

## マルチテナント設計

### テナント = 展示会（Exhibition）

- URL: `/{exhibition_slug}/register` → 展示会ごとに異なるフォーム
- 設定: exhibitions テーブルに展示会ごとのカスタマイズを格納
- データ分離: 全テーブルに `exhibition_id` を持たせてRLSで分離

### カスタマイズ可能な項目（展示会ごと）

| 項目 | 方法 |
|------|------|
| イベント名・日程・会場 | exhibitionsテーブルのカラム |
| フォーム項目の表示/必須 | form_fields JSONB カラム |
| ブランドカラー | branding JSONB カラム |
| 登録種別（一般/VIP/プレス等） | registration_types テーブル |
| セミナー | seminars テーブル |
