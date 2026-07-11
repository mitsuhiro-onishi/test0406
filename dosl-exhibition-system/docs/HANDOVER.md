# DOSL GATE 引き継ぎ（2026-07-07 作成 / 2026-07-11 送信ドメイン認証完了で更新）

## 【2026-07-11 送信ドメイン認証 完了（最新）】

### 完了したこと
- **送信ドメイン認証（dosl.co.jp）完遂**: Resendにドメイン追加（Tokyo・Full accessキー一時発行でAPI実施）→ エックスサーバーDNSに3レコード新規追加（DKIM TXT / send MX / send TXT SPF。既存レコード未変更）→ Verify（約20分で3件とも verified）
- **EMAIL_FROM を `noreply@dosl.co.jp` に変更**（Vercel Production・Sensitive）→ git archive クリーン書き出しから `npx vercel deploy --prod` で再デプロイ（コードは ad58c69 のまま・変更は環境変数のみ）
- **受信テスト合格**: 本番登録 → `m.onishi@dosl.co.jp`（Resendアカウント本人以外）で受信・本文・QRチケットリンク表示まで確認。Resend送信ログも `delivered`
- **テスト登録は削除済み**: Supabase SQL Editor で `DELETE FROM visitors WHERE email='m.onishi@dosl.co.jp'`（CASCADE）→ 残りは seed 由来の TEST1234/test@example.com のみ（=ベースライン維持）
- 操作マニュアル 5.1/5.2 をドメイン認証完了の内容に更新
- **これで実来場者への案内メールが任意のアドレスに送れる状態**（残っていたメール系の制限はすべて解消）

### キーの後始末（大西さんに依頼済み）
- Resend Full accessキー（temp-domain-setup）と今回のVercelトークンは作業完了につき削除依頼済み。Resendドメイン管理は今後ダッシュボード（https://resend.com/domains）でも確認可能

### 次のタスク（優先順）
1. 実展示会の登録（SQLで。展示会の実情報待ち・マニュアル4章）
2. GATEオプションの本番通し確認と features フラグON運用（機能はデプロイ済み。リード同意文言は本番反映済み ad58c69・[[project_dosl_service_roadmap]] 参照）
3. RALLY本番Supabase（schema適用のみ・[[project_dosl_service_roadmap]]）

## 【2026-07-08 運用フェーズ進捗】

### 完了したこと
- **メール送信有効化（残タスク1）完了**: Resendアカウント開設（mituhi3216@gmail.com・GitHubログイン）→ APIキー発行（Sending access限定）→ Vercelに `RESEND_API_KEY`/`EMAIL_FROM=onboarding@resend.dev` 設定 → 再デプロイ → 本番登録テストでメール受信・表示・チケットリンクまで確認済み
- テスト登録は削除済み。**本番DBはseed状態がベースライン**（seed由来のサンプル: チケット`TEST1234`/田中一郎/test@example.com の各1件は意図的に残存）
- **操作マニュアル作成**: `docs/操作マニュアル.md`（来場者/管理者/展示会作成SQL/メール/GATEオプション/運用/トラブル対応の8章）
- **GATEオプション（セミナー管理＋リードリトリーバル）は本番反映まで完了**: 別セッションが exhibition/registration-system への統合（リベース・履歴線形）→ 本番Supabaseへの005適用 → デプロイまで実施済み。/exhibitor/login の200応答と exhibitors/exhibitor_leads テーブルの存在を確認済み（2026-07-08）

### 進行中: 送信ドメイン認証（ここから再開）
- **送信ドメインは dosl.co.jp に決定**（エックスサーバーDNS管理・ns1〜5.xserver.jp確認済み。ex-system.jp案はAWS操作回避のため取り下げ）
- 次の一手: 操作マニュアル5.2の手順1から（Resendダッシュボードでドメイン追加→エックスサーバーDNSにレコード追加→Verify→EMAIL_FROM変更→再デプロイ→受信テスト）
- 注意: 現APIキーはSending access限定のためドメイン操作はダッシュボード or Full accessキー一時発行で

### キー・認証情報の運用メモ
- Vercelトークン・Supabase service_roleキーはセッション内で共有済み → **作業完了後にトークン削除／キーローテーション推奨**（service_roleをローテーションする場合はVercelの `SUPABASE_SERVICE_ROLE_KEY` 差し替え＋再デプロイをセットで）
- Vercel環境変数はSensitive設定のため `vercel env pull` では値を取得できない（必要時は大西さんからキーを受領する）
- 権限設定: `Projects/.claude/settings.local.json` に `vercel env pull` の許可ルール追加済み

### 次のタスク（優先順）
1. 送信ドメイン認証の完遂（上記・操作マニュアル5.2）
2. 実展示会の登録（残タスク2・SQLで。展示会の実情報待ち）
3. GATEオプションの本番通し確認（機能はデプロイ済み。features フラグON運用・リード同意文言は [[project_dosl_service_roadmap]] 参照）

## 【2026-07-08 本番化完了】

- **本番URL: https://dosl-gate.vercel.app**（Vercelプロジェクト `dosl-gate`）
- Supabase本番: プロジェクト `dosl-gate-setup`（ref: fosvjwwqafeflygsbrkm・東京リージョン・無料枠）
  - migrations 001〜004 + seed 適用済み。管理者ユーザー作成・admin_users紐付け済み
  - 管理者ログイン: mituhi3216@gmail.com（パスワードは大西さん保管）
- Vercel環境変数6つ設定済み（Production）。**メール送信は2026-07-08に有効化・本番で受信確認済み**
  - `RESEND_API_KEY`（Resendアカウント: mituhi3216@gmail.com / GitHubログイン・無料枠 月3,000通/日100通）と `EMAIL_FROM=onboarding@resend.dev` を追加し再デプロイ済み
  - `EMAIL_FROM` = 送信元アドレス（`src/lib/email.ts:49`。未設定時はダミー `noreply@exhibition.example.com` になり送信失敗する）
  - **残る制限: 送信ドメイン認証（SPF/DKIM）が未実施のため、onboarding@resend.dev 発でResendアカウント本人宛のみ送信可。実来場者への送信にはドメイン認証＋EMAIL_FROM変更が必要**（送信元ドメインの決定待ち）
- 本番で通し確認済み: 登録→QRチケット→管理ログイン→ダッシュボード→チェックイン→CSV。テストデータは掃除済み（DBはseed状態）
- 本番化作業中に致命バグ2件を発見・修正: ①RLS無限再帰（migration 004・9bf7594）②再登録時の来場者情報null上書き（9a569cf）。詳細は requirements.md 20章 #13/#14
- デプロイ手順: `git archive` でブランチをクリーン書き出し → `npx vercel deploy --prod`（作業ツリー直デプロイは未コミットファイル混入の恐れがあるため不可）
- 注意: `exhibition/gate-options` ブランチで別途GATEオプション開発が進行中。**マージ前懸念は2026-07-08確認で全て解消済み**: 005改番済（893e123）・004_fix重複解消済（両ブランチ同一）・9bf7594/9a569cf取り込み済・マージプレビューでコンフリクト0件。未取り込みはdocsコミット bc99f5a のみ。マージ実行は大西さんのGO待ち

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
- [ ] 環境変数6つ設定: `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_BASE_URL`（本番URL）/ `RESEND_API_KEY` / `EMAIL_FROM`（送信元アドレス）
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

## 新セッション用キックオフ文面（コピペ用・2026-07-11 更新）

```
DOSL GATE（展示会事前登録システム）の運用フェーズを引き継ぎます。

引き継ぎmd: Projects/exhibition-systems/registration-system/dosl-exhibition-system/docs/HANDOVER.md
（冒頭の【2026-07-11 送信ドメイン認証 完了】が最新）と docs/操作マニュアル.md を読んでから作業を開始してください。

状況:
- 本番公開済み（https://dosl-gate.vercel.app）。メール送信は完全稼働
  （送信ドメイン dosl.co.jp 認証済み・送信元 noreply@dosl.co.jp・任意のアドレスに送信可・受信テスト合格 2026-07-11）
- GATEオプション（セミナー管理・リードリトリーバル）は005適用・リード同意文言含め本番デプロイ済み（ad58c69）
- 本番DBはseed状態がベースライン（TEST1234のサンプル1件は意図的に残存）

最初のタスク: 実展示会の登録（SQLで。私から展示会の実情報を渡す。手順は操作マニュアル4章）

その次のタスク:
2. GATEオプションの本番通し確認と features フラグON運用（機能はデプロイ済み・マニュアル6章）
3. RALLY本番Supabase（schema適用のみ）

注意: 変更は1つずつ・検証してから次へ。git push・デプロイ・DNS変更などの外部影響操作は事前に私に確認。
デプロイは git archive でクリーン書き出し→ npx vercel deploy --prod（作業ツリー直は禁止）。
Vercel環境変数はSensitive設定のため env pull で値は取れない。キー・トークンは必要になったら私に聞いてください。
```
