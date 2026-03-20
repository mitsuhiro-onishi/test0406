-- ============================================================
-- 002: Security & Policy Fixes
-- 001_initial.sql のセキュリティ・仕様問題を修正
-- ============================================================

-- ============================================================
-- 1. generate_ticket_code() を暗号学的に安全にする
--    random() → gen_random_bytes (pgcrypto)
-- ============================================================
CREATE OR REPLACE FUNCTION generate_ticket_code()
RETURNS TEXT AS $$
DECLARE
    chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    chars_len INT := length(chars);
    result TEXT := '';
    raw_bytes BYTEA;
    i INT;
BEGIN
    raw_bytes := gen_random_bytes(8);
    FOR i IN 0..7 LOOP
        result := result || substr(chars, (get_byte(raw_bytes, i) % chars_len) + 1, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 2. 欠けていた管理者ポリシーの追加
--    - seminars: 管理者 CRUD
--    - registration_types: 管理者 CRUD
-- ============================================================

-- セミナー管理（管理者は自組織の展示会のセミナーを管理可能）
CREATE POLICY "admin_seminars_all" ON seminars
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM admin_users au
            JOIN exhibitions e ON e.id = seminars.exhibition_id
                AND e.organization_id = au.organization_id
            WHERE au.auth_user_id = auth.uid()
            AND au.is_active = TRUE
            AND (au.role IN ('owner', 'admin')
                 OR seminars.exhibition_id = ANY(au.exhibition_ids))
        )
    );

-- 登録種別管理
CREATE POLICY "admin_registration_types_all" ON registration_types
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM admin_users au
            JOIN exhibitions e ON e.id = registration_types.exhibition_id
                AND e.organization_id = au.organization_id
            WHERE au.auth_user_id = auth.uid()
            AND au.is_active = TRUE
            AND (au.role IN ('owner', 'admin')
                 OR registration_types.exhibition_id = ANY(au.exhibition_ids))
        )
    );

-- ============================================================
-- 3. admin_visitors_read を自組織のスコープに修正
--    旧: 全adminが全visitorを読める
--    新: 自組織の展示会に登録がある来場者のみ
-- ============================================================
DROP POLICY IF EXISTS "admin_visitors_read" ON visitors;

CREATE POLICY "admin_visitors_read" ON visitors
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM admin_users au
            JOIN exhibitions e ON e.organization_id = au.organization_id
            JOIN registrations r ON r.exhibition_id = e.id
                AND r.visitor_id = visitors.id
            WHERE au.auth_user_id = auth.uid()
            AND au.is_active = TRUE
        )
    );

-- ============================================================
-- 4. admin_entry_logs_all を修正
--    旧: JOIN registrations r ON TRUE（クロスジョイン）
--    新: 正しいJOIN条件
-- ============================================================
DROP POLICY IF EXISTS "admin_entry_logs_all" ON entry_logs;

CREATE POLICY "admin_entry_logs_all" ON entry_logs
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM admin_users au
            JOIN registrations r ON r.id = entry_logs.registration_id
            JOIN exhibitions e ON e.id = r.exhibition_id
                AND e.organization_id = au.organization_id
            WHERE au.auth_user_id = auth.uid()
            AND au.is_active = TRUE
        )
    );

-- ============================================================
-- 5. admin_seminar_bookings_all を修正
--    旧: JOIN seminars s ON TRUE（クロスジョイン）
--    新: 正しいJOIN条件
-- ============================================================
DROP POLICY IF EXISTS "admin_seminar_bookings_all" ON seminar_bookings;

CREATE POLICY "admin_seminar_bookings_all" ON seminar_bookings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM admin_users au
            JOIN seminars s ON s.id = seminar_bookings.seminar_id
            JOIN exhibitions e ON e.id = s.exhibition_id
                AND e.organization_id = au.organization_id
            WHERE au.auth_user_id = auth.uid()
            AND au.is_active = TRUE
        )
    );

-- ============================================================
-- 6. 匿名ユーザーが自分の登録情報を確認できるポリシー
--    ticket_code を知っている場合のみ読み取り可能
--    （QRチケット表示画面で使用）
-- ============================================================

-- 来場者の自分の登録情報を読む（ticket_code経由のAPIで使う想定）
-- 注: 実際のアクセス制御はAPI Route側でticket_codeの検証を行う
-- Supabase service_role key を使うため、ここではRLSは補助的な役割

-- ============================================================
-- 7. 招待コード匿名読み取りポリシーの強化
--    旧: コードの中身が全部見えるリスク
--    新: exhibition_id + code の完全一致が必要（検証用途のみ）
-- ============================================================
DROP POLICY IF EXISTS "anon_invitation_codes_read" ON invitation_codes;

CREATE POLICY "anon_invitation_codes_verify" ON invitation_codes
    FOR SELECT USING (
        -- この行自体は常にTRUEだが、WHERE句でexhibition_id + codeの
        -- 完全一致が必要。RLSだけではWHERE句の強制はできないため、
        -- API Route側で必ずexhibition_id + codeを指定するクエリのみ許可する。
        -- ここでは有効期限と使用回数のチェックのみ行う。
        used_count < max_uses
        AND (expires_at IS NULL OR expires_at > NOW())
    );

-- ============================================================
-- 8. visitors テーブルへの匿名更新ポリシー
--    同一メールで再登録した場合に情報を更新できるようにする
--    （API Route側で UPSERT を行う想定）
-- ============================================================
-- 注: visitors の UPDATE は service_role key 経由で行う設計とし、
-- anon ユーザーの UPDATE ポリシーは追加しない（セキュリティ上）

-- ============================================================
-- 9. exhibitions の admin ポリシーを staff にも正しく適用
--    旧: staff は exhibition_ids に含まれる展示会のみ
--    新: exhibition_ids が NULL の staff は全展示会にアクセス不可に修正
--         (NULL = 全アクセスではなく、owner/admin のみ全アクセス)
-- ============================================================
DROP POLICY IF EXISTS "admin_exhibitions_all" ON exhibitions;

CREATE POLICY "admin_exhibitions_all" ON exhibitions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM admin_users au
            WHERE au.auth_user_id = auth.uid()
            AND au.organization_id = exhibitions.organization_id
            AND au.is_active = TRUE
            AND (
                au.role IN ('owner', 'admin')
                OR (au.role = 'staff' AND exhibitions.id = ANY(au.exhibition_ids))
            )
        )
    );

-- ============================================================
-- 10. admin_users テーブルの自己参照ポリシー修正
--     WITH CHECK 句を追加して、staff が自分の role を昇格できないようにする
-- ============================================================
DROP POLICY IF EXISTS "admin_admin_users_all" ON admin_users;

-- SELECT: 自分自身 or 同一組織のowner/admin
CREATE POLICY "admin_users_select" ON admin_users
    FOR SELECT USING (
        auth_user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM admin_users au
            WHERE au.auth_user_id = auth.uid()
            AND au.organization_id = admin_users.organization_id
            AND au.role IN ('owner', 'admin')
            AND au.is_active = TRUE
        )
    );

-- INSERT/UPDATE/DELETE: owner/admin のみ
CREATE POLICY "admin_users_modify" ON admin_users
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM admin_users au
            WHERE au.auth_user_id = auth.uid()
            AND au.organization_id = admin_users.organization_id
            AND au.role IN ('owner', 'admin')
            AND au.is_active = TRUE
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM admin_users au
            WHERE au.auth_user_id = auth.uid()
            AND au.organization_id = admin_users.organization_id
            AND au.role IN ('owner', 'admin')
            AND au.is_active = TRUE
        )
    );
