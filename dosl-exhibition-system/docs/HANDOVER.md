# DOSL GATE 引き継ぎ（2026-07-07 作成 / 2026-07-08 本番化完了で更新）

## 【2026-07-08 本番化完了】

- **本番URL: https://dosl-gate.vercel.app**（Vercelプロジェクト `dosl-gate`）
- Supabase本番: プロジェクト `dosl-gate-setup`（ref: fosvjwwqafeflygsbrkm・東京リージョン・無料枠）
  - migrations 001〜004 + seed 適用済み。管理者ユーザー作成・admin_users紐付け済み
  - 管理者ログイン: mituhi3216@gmail.com（パスワードは大西さん保管）
- Vercel環境変数4つ設定済み（Production）。**RESEND_API_KEY のみ未設定**（メール送信は後日: Resendキー取得＋送信ドメイン認証とセット）
- 本番で通し確認済み: 登録→QRチケット→管理ログイン→ダッシュボード→チェックイン→CSV。テストデータは掃除済み（DBはseed状態）
- 本番化作業中に致命バグ2件を発見・修正: ①RLS無限再帰（migration 004・9bf7594）②再登録時の来場者情報null上書き（9a569cf）。詳細は requirements.md 20章 #13/#14
- デプロイ手順: `git archive` でブランチをクリーン書き出し → `npx vercel deploy --prod`（作業ツリー直デプロイは未コミットファイル混入の恐れがあるため不可）
- 注意: `exhibition/gate-options` ブランチで別途GATEオプション開発が進行中。マージ時に 004_gate_options.sql → 005 へのリネームと、ffdaedf に混入した 004_fix の重複解消が必要

## プロジェクト概要

- **DOSL GATE** = 展示会の事前登録・QRチケット・受付チェックイン・登録者管理のマルチテナントSaaS
- 場所: `Projects/exhibition-systems/registration-system/dosl-exhibition-system/`
- 技術: Next.js 14 (App Router) + TypeScript + Tailwind + Supabase (PostgreSQL/Auth) + Resend（メール）+ Vercel（デプロイ想定）
- 参考: システムフォワード社の事前登録システム（`Projects/daimatsu` 参照）。ダイマツフェア等の情報は参考情報であり、DOSL案件として扱う（OCL AI / アレグロマジックと混在させない）
- 兄弟サービス: DOSL HUB（書類提出管理 `exhibition-systems/document-management/`）

## 現在の状態（2026-07-07 開発完了）

- コードは**完成**。要件定義書19.2の未実装分（サーバー側バリデーション / 管理API認証 / レート制限 / トークン自動リフレッシュmiddleware / DB制約）を全て実装済み
- 再点検で12件のバグを修正済み（詳細: `docs/requirements.md` 20章）。特に大きいもの:
  - visitors upsert の ON CONFLICT 不一致（登録APIが実行時エラーになる致命バグ）→ select→update/insert 方式に修正
  - `/admin/login` の無限リダイレクトループ → `admin/(protected)/` ルートグループで認証範囲を分離
  - メールHTML / CSV数式 / 検索フィルタの各インジェクション対策
- 検証済み: 単体テスト14件（`npm test`）/ `npm run build` / 実サーバーで認証401・バリデーション400・レート制限429・画面表示
- **未実施**: 実Supabaseに繋いだ通し動作確認（ローカルはダミー env のため）
- 最新コミット: `5defbdc feat: バリデーション・セキュリティ要件の残実装と再点検バグ修正`（ブランチ exhibition/registration-system）

## 残タスク（本番化）

### 1. Supabase プロジェクト作成
- [ ] 新規プロジェクト作成（無料枠でOK。リージョンは東京推奨）
- [ ] SQL Editor で `supabase/migrations/001_initial.sql` → `002_security_fixes.sql` → `003_data_constraints.sql` を順に適用
- [ ] `supabase/seed.sql` を適用（サンプル展示会・種別・セミナー入り）
- [ ] Authentication > Users で管理者ユーザーを作成（メール+パスワード）
- [ ] 作成したユーザーのUUIDで `admin_users.auth_user_id` を更新（seedはダミーUUID `00000000-...-aaaaaaaaaaaa` のまま）:
  ```sql
  UPDATE admin_users SET auth_user_id = '<実UUID>' WHERE id = '00000000-0000-0000-0000-000000000100';
  ```

### 2. ローカルで実DB通し確認
- [ ] `.env.local` を実値に書き換え（現在はダミー値。URL/anon key/service_role key）
- [ ] `npm run dev -- --port 3299` → 以下を通しで確認:
  - [ ] `/sample-exhibition-2026/register` で事前登録 → チケットコード表示
  - [ ] 同一メールで再登録 → 「既に登録済みです」で既存コード返却
  - [ ] `/sample-exhibition-2026/ticket/<code>` でQR表示
  - [ ] `/admin/login` でログイン → ダッシュボード・登録者一覧・編集・CSV出力
  - [ ] `/admin/checkin` で手動入力チェックイン → 初入場（緑）→ 再スキャンで再入場（黄）
  - [ ] キャンセル済み登録のチェックイン拒否
  - [ ] セミナー定員超過時の拒否（capacity=1 のセミナーを作ってテスト）
- [ ] メール確認: Resend APIキー取得 → `.env.local` に `RESEND_API_KEY` と `NEXT_PUBLIC_BASE_URL` 設定 → 登録して受信確認
  - 送信ドメイン認証（SPF/DKIM）が未設定の間は Resend のテスト送信先制限あり

### 3. Vercel デプロイ
- [ ] Vercel プロジェクト作成（Root Directory = `dosl-exhibition-system`）
- [ ] 環境変数5つ設定: `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_BASE_URL`（本番URL）/ `RESEND_API_KEY`
- [ ] デプロイ後、本番URLで上記通し確認を再実施
- [ ] git push は実行前にユーザー確認を取ること（外部影響操作のルール）

## 既知の制約・将来課題（今やらない）

- **展示会の作成・編集UIなし** → 新規展示会はSupabaseダッシュボード/SQLで作成する運用。案件が続くなら最優先の追加開発候補
- レート制限はインメモリ（Vercelインスタンス単位）。厳密化が必要なら Upstash 等へ
- staffロールの展示会別アクセス分離はアプリ側未実装（admin/staffとも全展示会可視）
- 未実装機能（19.1）: セミナー管理UI・招待コード運用・バッジ印刷・入場番号・退場トラッキング・リマインダーメール・管理者/組織管理UI・登録者削除

## 重要な方針・注意

- **変更は1つずつ、既存機能を壊さない。検証してからデプロイ**（ユーザー方針）
- Web UIの変更時は curl だけでなく実ブラウザで描画まで確認する
- DOSL案件のため、OCL AI関連の文脈・資料と混在させない
- コード側の追加開発（UI新設など）に入る場合は、`docs/requirements.md` を正として更新しながら進める
- ローカル起動は launch.json の `dosl-gate-dev`（port 3299。3000は他プロジェクトと衝突するため）
- 単体テスト: `npm test`（Node 24 でTS直接実行）

## 関係者

- 大西さん（DOSL・開発者本人）

---

## 新セッション用キックオフ文面（コピペ用・2026-07-08更新）

```
DOSL GATE（展示会事前登録システム）の運用フェーズを引き継ぎます。

引き継ぎmd: Projects/exhibition-systems/registration-system/dosl-exhibition-system/docs/HANDOVER.md
を読んでから作業を開始してください。

状況: 2026-07-08に本番公開済み（https://dosl-gate.vercel.app）。
Supabase本番（ref: fosvjwwqafeflygsbrkm）はmigrations 001〜004+seed適用済み・通し確認済み。
ブランチは exhibition/registration-system（origin にpush済み）。

残タスク（着手指示があったものから）:
1. メール送信の有効化: Resend APIキー取得 → Vercel環境変数 RESEND_API_KEY 追加 →
   送信ドメイン認証（SPF/DKIM）→ 登録して受信確認（認証前はResendのテスト送信先制限あり）
2. 実展示会の登録: 作成UIが無いため、SupabaseダッシュボードのSQLで
   organizations/exhibitions/registration_types を登録する（seed.sql が雛形）
3. GATEオプション（exhibition/gate-options ブランチ・別開発）のマージ対応:
   004_gate_options.sql→005リネーム / ffdaedfに混入した004_fixの重複解消 /
   9a569cf（再登録null上書き修正）の取り込み

注意: 変更は1つずつ・検証してから次へ。git pushや外部影響操作は事前に私に確認。
デプロイは git archive でクリーン書き出し→ npx vercel deploy --prod（作業ツリー直は禁止）。
Supabase/Vercelのキー・トークンは私が用意するので、必要になったら聞いてください。
```
