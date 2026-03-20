-- ============================================================
-- DOSL Exhibition Registration System
-- Initial Migration
-- ============================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. organizations (DOSL自体やクライアント企業)
--    SaaS運用を見据えた組織テーブル
-- ============================================================
CREATE TABLE organizations (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,                    -- 組織名（例: DOSL, ダイマツ）
    slug        TEXT NOT NULL UNIQUE,             -- URL用スラッグ
    plan        TEXT NOT NULL DEFAULT 'basic',    -- 料金プラン（将来用）
    settings    JSONB NOT NULL DEFAULT '{}',      -- 組織レベル設定
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_organizations_slug ON organizations(slug);

-- ============================================================
-- 2. exhibitions (展示会マスター)
--    マルチテナントの中核。展示会ごとの設定を全てここに集約
-- ============================================================
CREATE TABLE exhibitions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- 基本情報
    name            TEXT NOT NULL,                -- 展示会名
    slug            TEXT NOT NULL UNIQUE,         -- URL用スラッグ（例: daimatsu-fair-2026）
    description     TEXT,                         -- 説明文
    status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'published', 'closed', 'archived')),

    -- 開催情報
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    venue_name      TEXT,                         -- 会場名
    venue_address   TEXT,                         -- 会場住所

    -- フォーム設定（展示会ごとにカスタマイズ）
    -- visible: 表示するか, required: 必須か, label: ラベル上書き
    form_fields     JSONB NOT NULL DEFAULT '{
        "company_name":   {"visible": true, "required": true},
        "company_kana":   {"visible": true, "required": false},
        "department":     {"visible": true, "required": false},
        "position":       {"visible": true, "required": false},
        "phone":          {"visible": true, "required": false},
        "postal_code":    {"visible": false, "required": false},
        "address":        {"visible": false, "required": false},
        "industry":       {"visible": true, "required": false},
        "visit_purpose":  {"visible": true, "required": false},
        "companions":     {"visible": true, "required": false, "max": 4}
    }',

    -- 選択肢設定
    industry_options    JSONB NOT NULL DEFAULT '["製造業","建設業","卸売業","小売業","飲食業","サービス業","IT・通信","不動産業","運輸業","金融・保険業","医療・福祉","教育","官公庁・団体","その他"]',
    purpose_options     JSONB NOT NULL DEFAULT '["情報収集","商談・取引","技術調査","新製品確認","その他"]',

    -- ブランディング設定
    branding        JSONB NOT NULL DEFAULT '{
        "primary_color": "#4a90d9",
        "secondary_color": "#6db0f0",
        "logo_url": null,
        "banner_url": null,
        "copyright": null
    }',

    -- 機能ON/OFF
    features        JSONB NOT NULL DEFAULT '{
        "seminar": false,
        "companion": true,
        "entry_number": false,
        "badge_print": false,
        "exit_tracking": false
    }',

    -- メール設定
    email_settings  JSONB NOT NULL DEFAULT '{
        "from_name": "DOSL Registration",
        "reply_to": null,
        "confirmation_subject": "事前登録完了のお知らせ",
        "reminder_enabled": true,
        "reminder_days_before": 3
    }',

    -- メタ
    max_registrations   INT,                      -- 登録上限（NULLは無制限）
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_dates CHECK (end_date >= start_date)
);

CREATE INDEX idx_exhibitions_org ON exhibitions(organization_id);
CREATE INDEX idx_exhibitions_slug ON exhibitions(slug);
CREATE INDEX idx_exhibitions_status ON exhibitions(status);

-- ============================================================
-- 3. registration_types (登録種別マスター)
--    展示会ごとに来場者カテゴリを定義
-- ============================================================
CREATE TABLE registration_types (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exhibition_id   UUID NOT NULL REFERENCES exhibitions(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,            -- 例: 一般来場者, VIP, プレス
    slug            TEXT NOT NULL,            -- 例: general, vip, press
    description     TEXT,
    color           TEXT DEFAULT '#333333',   -- バッジの色分け用
    requires_code   BOOLEAN NOT NULL DEFAULT FALSE,  -- 招待コード必要か
    sort_order      INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(exhibition_id, slug)
);

CREATE INDEX idx_reg_types_exhibition ON registration_types(exhibition_id);

-- ============================================================
-- 4. visitors (来場者マスター)
--    展示会横断の来場者情報。メールアドレスで一意
-- ============================================================
CREATE TABLE visitors (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- 基本情報（必須）
    email           TEXT NOT NULL,
    last_name       TEXT NOT NULL,            -- 姓
    first_name      TEXT NOT NULL,            -- 名
    last_name_kana  TEXT,                     -- セイ
    first_name_kana TEXT,                     -- メイ

    -- 所属情報
    company_name    TEXT,
    company_kana    TEXT,
    department      TEXT,                     -- 部署
    position        TEXT,                     -- 役職

    -- 連絡先
    phone           TEXT,
    postal_code     TEXT,
    address         TEXT,

    -- メタ
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- メールで来場者を一意に特定
CREATE UNIQUE INDEX idx_visitors_email ON visitors(LOWER(email));
CREATE INDEX idx_visitors_company ON visitors(company_name);

-- ============================================================
-- 5. registrations (事前登録)
--    来場者 × 展示会 の紐付け。QRコード情報もここ
-- ============================================================
CREATE TABLE registrations (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exhibition_id       UUID NOT NULL REFERENCES exhibitions(id) ON DELETE CASCADE,
    visitor_id          UUID NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
    registration_type_id UUID REFERENCES registration_types(id),

    -- 登録情報
    ticket_code         TEXT NOT NULL UNIQUE,     -- QRコードに埋め込むユニークコード
    status              TEXT NOT NULL DEFAULT 'confirmed'
                        CHECK (status IN ('confirmed', 'cancelled', 'waitlisted')),

    -- 展示会固有の入力情報
    industry            TEXT,                     -- 業種
    visit_purpose       TEXT[],                   -- 来場目的（複数選択）
    entry_number        TEXT,                     -- エントリー番号
    custom_fields       JSONB NOT NULL DEFAULT '{}',  -- 展示会固有の追加フィールド

    -- 同伴者情報
    companions          JSONB NOT NULL DEFAULT '[]',
    -- 例: [{"name": "山田花子", "name_kana": "ヤマダハナコ", "company": "ABC社"}]

    -- QR・メール
    qr_sent_at          TIMESTAMPTZ,             -- QRコード送信日時
    reminder_sent_at    TIMESTAMPTZ,             -- リマインド送信日時

    -- メタ
    registered_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- 同一展示会に同一来場者は1登録のみ
    UNIQUE(exhibition_id, visitor_id)
);

CREATE INDEX idx_registrations_exhibition ON registrations(exhibition_id);
CREATE INDEX idx_registrations_visitor ON registrations(visitor_id);
CREATE INDEX idx_registrations_ticket ON registrations(ticket_code);
CREATE INDEX idx_registrations_status ON registrations(status);

-- ============================================================
-- 6. entry_logs (入退場記録)
--    展示会当日の入退場ログ
-- ============================================================
CREATE TABLE entry_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    registration_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,

    action          TEXT NOT NULL CHECK (action IN ('entry', 'exit')),
    gate            TEXT,                     -- 受付ゲート名
    method          TEXT NOT NULL DEFAULT 'qr'
                    CHECK (method IN ('qr', 'manual', 'walk_in')),
    scanned_by      UUID,                    -- スキャンしたスタッフ（auth.users参照）

    logged_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_entry_logs_registration ON entry_logs(registration_id);
CREATE INDEX idx_entry_logs_time ON entry_logs(logged_at);

-- ============================================================
-- 7. seminars (セミナー)
--    展示会併催セミナーの管理（features.seminar = true の場合に使用）
-- ============================================================
CREATE TABLE seminars (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exhibition_id   UUID NOT NULL REFERENCES exhibitions(id) ON DELETE CASCADE,

    title           TEXT NOT NULL,
    description     TEXT,
    speaker_name    TEXT,
    speaker_title   TEXT,                     -- 講演者の肩書

    venue_name      TEXT,                     -- セミナー会場名
    capacity        INT,                      -- 定員（NULLは無制限）

    starts_at       TIMESTAMPTZ NOT NULL,
    ends_at         TIMESTAMPTZ NOT NULL,

    status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('draft', 'open', 'closed', 'cancelled')),

    sort_order      INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_seminar_times CHECK (ends_at > starts_at)
);

CREATE INDEX idx_seminars_exhibition ON seminars(exhibition_id);
CREATE INDEX idx_seminars_time ON seminars(starts_at);

-- ============================================================
-- 8. seminar_bookings (セミナー予約)
-- ============================================================
CREATE TABLE seminar_bookings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    seminar_id      UUID NOT NULL REFERENCES seminars(id) ON DELETE CASCADE,
    registration_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,

    status          TEXT NOT NULL DEFAULT 'confirmed'
                    CHECK (status IN ('confirmed', 'waitlisted', 'cancelled')),

    checked_in_at   TIMESTAMPTZ,             -- セミナーチェックイン日時

    booked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- 同一セミナーに同一登録は1予約のみ
    UNIQUE(seminar_id, registration_id)
);

CREATE INDEX idx_seminar_bookings_seminar ON seminar_bookings(seminar_id);
CREATE INDEX idx_seminar_bookings_registration ON seminar_bookings(registration_id);

-- ============================================================
-- 9. admin_users (管理者とスタッフの権限管理)
--    Supabase Auth (auth.users) と紐づけ
-- ============================================================
CREATE TABLE admin_users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_user_id    UUID NOT NULL UNIQUE,     -- auth.users.id
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    display_name    TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'staff'
                    CHECK (role IN ('owner', 'admin', 'staff')),

    -- staffは特定展示会のみアクセス可（NULLは全展示会）
    exhibition_ids  UUID[] DEFAULT NULL,

    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_users_auth ON admin_users(auth_user_id);
CREATE INDEX idx_admin_users_org ON admin_users(organization_id);

-- ============================================================
-- 10. invitation_codes (招待コード)
--     VIPやプレスなど特定種別向けの招待管理
-- ============================================================
CREATE TABLE invitation_codes (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exhibition_id       UUID NOT NULL REFERENCES exhibitions(id) ON DELETE CASCADE,
    registration_type_id UUID NOT NULL REFERENCES registration_types(id) ON DELETE CASCADE,

    code                TEXT NOT NULL,             -- 招待コード
    max_uses            INT NOT NULL DEFAULT 1,    -- 使用回数上限
    used_count          INT NOT NULL DEFAULT 0,    -- 使用済み回数

    expires_at          TIMESTAMPTZ,               -- 有効期限
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(exhibition_id, code)
);

CREATE INDEX idx_invitation_codes_exhibition ON invitation_codes(exhibition_id);

-- ============================================================
-- Views: よく使う集計クエリ
-- ============================================================

-- 展示会ごとの登録者数サマリー
CREATE VIEW v_exhibition_stats AS
SELECT
    e.id AS exhibition_id,
    e.name AS exhibition_name,
    e.slug,
    e.start_date,
    e.end_date,
    e.status,
    COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'confirmed') AS confirmed_count,
    COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'cancelled') AS cancelled_count,
    COUNT(DISTINCT el.id) FILTER (WHERE el.action = 'entry') AS entry_count,
    e.max_registrations
FROM exhibitions e
LEFT JOIN registrations r ON r.exhibition_id = e.id
LEFT JOIN entry_logs el ON el.registration_id = r.id
GROUP BY e.id;

-- セミナーの予約状況サマリー
CREATE VIEW v_seminar_stats AS
SELECT
    s.id AS seminar_id,
    s.exhibition_id,
    s.title,
    s.capacity,
    s.starts_at,
    s.ends_at,
    COUNT(*) FILTER (WHERE sb.status = 'confirmed') AS confirmed_count,
    COUNT(*) FILTER (WHERE sb.status = 'waitlisted') AS waitlisted_count,
    COUNT(*) FILTER (WHERE sb.checked_in_at IS NOT NULL) AS checked_in_count
FROM seminars s
LEFT JOIN seminar_bookings sb ON sb.seminar_id = s.id
GROUP BY s.id;

-- ============================================================
-- Functions: チケットコード生成
-- ============================================================
CREATE OR REPLACE FUNCTION generate_ticket_code()
RETURNS TEXT AS $$
DECLARE
    chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    result TEXT := '';
    i INT;
BEGIN
    FOR i IN 1..8 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Triggers: updated_at 自動更新
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_organizations_updated
    BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_exhibitions_updated
    BEFORE UPDATE ON exhibitions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_visitors_updated
    BEFORE UPDATE ON visitors FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_registrations_updated
    BEFORE UPDATE ON registrations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_seminars_updated
    BEFORE UPDATE ON seminars FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_seminar_bookings_updated
    BEFORE UPDATE ON seminar_bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_admin_users_updated
    BEFORE UPDATE ON admin_users FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- RLS: Row Level Security
-- セキュリティレビューで詳細設定を確定する
-- ============================================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE exhibitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE entry_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE seminars ENABLE ROW LEVEL SECURITY;
ALTER TABLE seminar_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitation_codes ENABLE ROW LEVEL SECURITY;

-- ---- Public read: 公開中の展示会情報は誰でも読める ----
CREATE POLICY "public_exhibitions_read" ON exhibitions
    FOR SELECT USING (status = 'published');

-- ---- Public read: 公開中展示会の登録種別 ----
CREATE POLICY "public_reg_types_read" ON registration_types
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM exhibitions e
            WHERE e.id = registration_types.exhibition_id
            AND e.status = 'published'
        )
    );

-- ---- Public read: 公開中展示会のセミナー ----
CREATE POLICY "public_seminars_read" ON seminars
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM exhibitions e
            WHERE e.id = seminars.exhibition_id
            AND e.status = 'published'
        )
    );

-- ---- Anonymous insert: 事前登録（来場者作成） ----
CREATE POLICY "anon_visitors_insert" ON visitors
    FOR INSERT WITH CHECK (TRUE);
    -- 注: 事前登録フォームからの作成を許可
    -- API Route側でバリデーション・レート制限を実施

-- ---- Anonymous insert: 事前登録 ----
CREATE POLICY "anon_registrations_insert" ON registrations
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM exhibitions e
            WHERE e.id = registrations.exhibition_id
            AND e.status = 'published'
        )
    );

-- ---- Admin: 管理者は自組織のデータに全アクセス ----
CREATE POLICY "admin_organizations_all" ON organizations
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM admin_users au
            WHERE au.auth_user_id = auth.uid()
            AND au.organization_id = organizations.id
            AND au.is_active = TRUE
        )
    );

CREATE POLICY "admin_exhibitions_all" ON exhibitions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM admin_users au
            WHERE au.auth_user_id = auth.uid()
            AND au.organization_id = exhibitions.organization_id
            AND au.is_active = TRUE
            AND (au.role IN ('owner', 'admin')
                 OR exhibitions.id = ANY(au.exhibition_ids))
        )
    );

CREATE POLICY "admin_registrations_all" ON registrations
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM admin_users au
            JOIN exhibitions e ON e.organization_id = au.organization_id
            WHERE au.auth_user_id = auth.uid()
            AND e.id = registrations.exhibition_id
            AND au.is_active = TRUE
        )
    );

CREATE POLICY "admin_visitors_read" ON visitors
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM admin_users au
            WHERE au.auth_user_id = auth.uid()
            AND au.is_active = TRUE
        )
    );

CREATE POLICY "admin_entry_logs_all" ON entry_logs
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM admin_users au
            JOIN registrations r ON TRUE
            JOIN exhibitions e ON e.id = r.exhibition_id AND e.organization_id = au.organization_id
            WHERE au.auth_user_id = auth.uid()
            AND r.id = entry_logs.registration_id
            AND au.is_active = TRUE
        )
    );

CREATE POLICY "admin_seminar_bookings_all" ON seminar_bookings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM admin_users au
            JOIN seminars s ON TRUE
            JOIN exhibitions e ON e.id = s.exhibition_id AND e.organization_id = au.organization_id
            WHERE au.auth_user_id = auth.uid()
            AND s.id = seminar_bookings.seminar_id
            AND au.is_active = TRUE
        )
    );

CREATE POLICY "admin_admin_users_all" ON admin_users
    FOR ALL USING (
        auth_user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM admin_users au
            WHERE au.auth_user_id = auth.uid()
            AND au.organization_id = admin_users.organization_id
            AND au.role IN ('owner', 'admin')
            AND au.is_active = TRUE
        )
    );

CREATE POLICY "admin_invitation_codes_all" ON invitation_codes
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM admin_users au
            JOIN exhibitions e ON e.organization_id = au.organization_id
            WHERE au.auth_user_id = auth.uid()
            AND e.id = invitation_codes.exhibition_id
            AND au.is_active = TRUE
        )
    );

-- Anonymous: 招待コード検証用の読み取り
CREATE POLICY "anon_invitation_codes_read" ON invitation_codes
    FOR SELECT USING (
        used_count < max_uses
        AND (expires_at IS NULL OR expires_at > NOW())
    );
