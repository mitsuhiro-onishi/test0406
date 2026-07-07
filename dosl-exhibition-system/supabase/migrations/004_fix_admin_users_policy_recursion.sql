-- ============================================================
-- 004: admin_users ポリシーの無限再帰修正
--
-- 002 の admin_users_select / admin_users_modify は admin_users を
-- 自己参照しており、RLS評価が無限再帰する（42P17）。
-- admin_users をサブクエリする他テーブルのポリシー評価にも波及し、
-- 匿名の exhibitions 読み取りを含む全クエリが失敗していた。
--
-- 修正: SECURITY DEFINER 関数（テーブル所有者権限で実行され
-- RLSを介さない）で管理者判定を行い、自己参照を排除する。
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_org_admin(target_org UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM admin_users
        WHERE auth_user_id = auth.uid()
          AND organization_id = target_org
          AND role IN ('owner', 'admin')
          AND is_active = TRUE
    );
$$;

REVOKE ALL ON FUNCTION public.is_org_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_admin(UUID) TO authenticated, anon;

-- SELECT: 自分自身 or 同一組織のowner/admin（自己参照を関数呼び出しに置換）
DROP POLICY IF EXISTS "admin_users_select" ON admin_users;

CREATE POLICY "admin_users_select" ON admin_users
    FOR SELECT USING (
        auth_user_id = auth.uid()
        OR is_org_admin(admin_users.organization_id)
    );

-- INSERT/UPDATE/DELETE: owner/admin のみ（WITH CHECK も維持）
DROP POLICY IF EXISTS "admin_users_modify" ON admin_users;

CREATE POLICY "admin_users_modify" ON admin_users
    FOR ALL USING (is_org_admin(admin_users.organization_id))
    WITH CHECK (is_org_admin(admin_users.organization_id));
