-- ============================================================
-- 005: GATEオプション「リードリトリーバル」
--
-- 出展社がブースで来場者のQR入場証をスキャンしてリードを取得する
-- オプション機能。展示会ごとに features.lead_retrieval フラグでON/OFF。
-- （セミナー管理オプションは初期スキーマのテーブルを使うため追加なし）
-- ============================================================

-- ============================================================
-- 1. exhibitors (出展社)
--    アクセスコードでログインする（Supabase Authは使わない）
-- ============================================================
CREATE TABLE exhibitors (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exhibition_id   UUID NOT NULL REFERENCES exhibitions(id) ON DELETE CASCADE,

    name            TEXT NOT NULL,            -- 出展社名
    booth_number    TEXT,                     -- ブース番号
    contact_name    TEXT,                     -- 担当者名
    contact_email   TEXT,                     -- 担当者メール

    access_code     TEXT NOT NULL UNIQUE,     -- ログイン用アクセスコード（12文字英数字）
    is_active       BOOLEAN NOT NULL DEFAULT true,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT exhibitors_name_len CHECK (char_length(name) <= 100),
    CONSTRAINT exhibitors_booth_len CHECK (char_length(booth_number) <= 20),
    CONSTRAINT exhibitors_contact_name_len CHECK (char_length(contact_name) <= 50),
    CONSTRAINT exhibitors_contact_email_len CHECK (char_length(contact_email) <= 254),
    CONSTRAINT exhibitors_access_code_format CHECK (access_code ~ '^[A-Z0-9]{12}$')
);

CREATE INDEX idx_exhibitors_exhibition ON exhibitors(exhibition_id);

-- ============================================================
-- 2. exhibitor_leads (リード)
--    出展社 × 登録者。同一来場者の再スキャンは1件のまま
-- ============================================================
CREATE TABLE exhibitor_leads (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exhibitor_id    UUID NOT NULL REFERENCES exhibitors(id) ON DELETE CASCADE,
    registration_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,

    note            TEXT,                     -- 商談メモ

    scanned_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(exhibitor_id, registration_id),
    CONSTRAINT exhibitor_leads_note_len CHECK (char_length(note) <= 500)
);

CREATE INDEX idx_exhibitor_leads_exhibitor ON exhibitor_leads(exhibitor_id);
CREATE INDEX idx_exhibitor_leads_registration ON exhibitor_leads(registration_id);

-- ============================================================
-- updated_at 自動更新トリガー
-- ============================================================
CREATE TRIGGER trg_exhibitors_updated_at
    BEFORE UPDATE ON exhibitors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_exhibitor_leads_updated_at
    BEFORE UPDATE ON exhibitor_leads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- RLS（既存テーブルと同方針: service_role 経由のみ許可）
-- ============================================================
ALTER TABLE exhibitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE exhibitor_leads ENABLE ROW LEVEL SECURITY;
