-- ============================================================
-- Seed Data: 開発・テスト用初期データ
-- ============================================================

-- 1. DOSLの組織
INSERT INTO organizations (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'DOSL', 'dosl');

-- 2. サンプル展示会（ダイマツフェアをベースに）
INSERT INTO exhibitions (
    id, organization_id, name, slug, description, status,
    start_date, end_date, venue_name, venue_address,
    form_fields, branding, features
)
VALUES (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000001',
    'サンプル展示会 2026',
    'sample-exhibition-2026',
    'DOSLの事前登録システム動作確認用サンプル展示会',
    'published',
    '2026-06-01', '2026-06-02',
    'サンプル会場',
    '東京都千代田区...',
    '{
        "company_name":   {"visible": true, "required": true},
        "company_kana":   {"visible": true, "required": true},
        "department":     {"visible": true, "required": false},
        "position":       {"visible": true, "required": false},
        "phone":          {"visible": true, "required": false},
        "postal_code":    {"visible": false, "required": false},
        "address":        {"visible": false, "required": false},
        "industry":       {"visible": true, "required": false},
        "visit_purpose":  {"visible": true, "required": false},
        "companions":     {"visible": true, "required": false, "max": 4}
    }',
    '{
        "primary_color": "#4a90d9",
        "secondary_color": "#6db0f0",
        "logo_url": null,
        "banner_url": null,
        "copyright": "Copyright © DOSL Inc."
    }',
    '{
        "seminar": true,
        "companion": true,
        "entry_number": false,
        "badge_print": false,
        "exit_tracking": false
    }'
);

-- 3. 登録種別
INSERT INTO registration_types (exhibition_id, name, slug, color, sort_order)
VALUES
    ('00000000-0000-0000-0000-000000000010', '一般来場者', 'general', '#333333', 1),
    ('00000000-0000-0000-0000-000000000010', 'VIP', 'vip', '#FFD700', 2),
    ('00000000-0000-0000-0000-000000000010', 'プレス', 'press', '#FF6347', 3);

-- 4. サンプルセミナー
INSERT INTO seminars (exhibition_id, title, description, speaker_name, speaker_title, venue_name, capacity, starts_at, ends_at, status)
VALUES
    ('00000000-0000-0000-0000-000000000010', '基調講演: DX最前線', 'デジタルトランスフォーメーションの最新動向', '山田太郎', '代表取締役', 'メインホール', 200, '2026-06-01 10:00+09', '2026-06-01 11:30+09', 'open'),
    ('00000000-0000-0000-0000-000000000010', 'ワークショップ: IoT入門', 'ハンズオン形式のIoTワークショップ', '鈴木次郎', '技術部長', '会議室A', 30, '2026-06-01 13:00+09', '2026-06-01 14:30+09', 'open'),
    ('00000000-0000-0000-0000-000000000010', 'パネルディスカッション: AI活用', '各社のAI活用事例を議論', '複数登壇者', '', 'メインホール', 200, '2026-06-02 10:00+09', '2026-06-02 12:00+09', 'open');

-- 5. テスト用管理者
-- 注: auth_user_id は Supabase Auth でユーザー作成後に実際のUUIDに差し替える
INSERT INTO admin_users (id, auth_user_id, organization_id, display_name, role)
VALUES
    ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000001', 'テスト管理者', 'owner');

-- 6. テスト用来場者 & 登録
INSERT INTO visitors (id, email, last_name, first_name, last_name_kana, first_name_kana, company_name, department, phone)
VALUES
    ('00000000-0000-0000-0000-000000000200', 'test@example.com', '田中', '一郎', 'タナカ', 'イチロウ', 'テスト株式会社', '営業部', '03-1234-5678');

INSERT INTO registrations (id, exhibition_id, visitor_id, ticket_code, status, industry, visit_purpose)
VALUES
    ('00000000-0000-0000-0000-000000000300', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000200', 'TEST1234', 'confirmed', '製造業', ARRAY['情報収集', '新製品確認']);
