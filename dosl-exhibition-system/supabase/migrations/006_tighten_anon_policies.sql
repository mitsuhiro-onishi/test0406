-- ============================================================
-- 006: 匿名アクセスポリシーの厳格化（2026-07-13 セキュリティ監査対応）
--
-- 背景:
-- 1. anon INSERT ポリシー（visitors / registrations）
--    事前登録はAPI Route（service_role・レート制限・入力検証つき）経由のみで
--    行っており、匿名キーでの直接INSERTを許可する必要がない。
--    残しておくと公開anon keyでバリデーションを迂回したゴミデータ挿入が可能。
-- 2. anon SELECT ポリシー（invitation_codes）
--    RLSではWHERE句を強制できず、匿名キーで有効な招待コードが列挙可能だった。
--    招待コード検証機能は現在未実装（コード内参照ゼロ）。実装時は
--    API Route（service_role）側で完全一致検証を行う設計とする。
--
-- 影響: なし（登録フォーム・管理画面・出展社画面はいずれもこれらの
--       ポリシーを使用していないことをコードレビューで確認済み）
-- ============================================================

DROP POLICY IF EXISTS "anon_visitors_insert" ON visitors;
DROP POLICY IF EXISTS "anon_registrations_insert" ON registrations;
DROP POLICY IF EXISTS "anon_invitation_codes_verify" ON invitation_codes;
-- 001の旧ポリシー名も念のため削除（002で置換済みのはずだが冪等に）
DROP POLICY IF EXISTS "anon_invitation_codes_read" ON invitation_codes;
