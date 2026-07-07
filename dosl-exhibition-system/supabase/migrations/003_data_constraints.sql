-- ============================================================
-- 003: Data Constraints
-- 要件定義書 4.2「データベース制約」の未実装分を追加
-- ・TEXT 列の最大長制約
-- ・電話番号 / 郵便番号の形式制約
-- ・チケットコードの形式制約
-- ・JSONB 構造制約 (companions / custom_fields)
--
-- 既存データで違反があってもマイグレーションが失敗しないよう
-- NOT VALID で追加する（新規行・更新行にのみ適用される）。
-- 既存データを検証する場合は後から
--   ALTER TABLE ... VALIDATE CONSTRAINT ...
-- を実行する。
-- ============================================================

-- ---- visitors: 文字数上限 ----
ALTER TABLE visitors
    ADD CONSTRAINT chk_visitors_email_len       CHECK (char_length(email) <= 254) NOT VALID,
    ADD CONSTRAINT chk_visitors_last_name_len   CHECK (char_length(last_name) <= 50) NOT VALID,
    ADD CONSTRAINT chk_visitors_first_name_len  CHECK (char_length(first_name) <= 50) NOT VALID,
    ADD CONSTRAINT chk_visitors_last_kana_len   CHECK (last_name_kana IS NULL OR char_length(last_name_kana) <= 50) NOT VALID,
    ADD CONSTRAINT chk_visitors_first_kana_len  CHECK (first_name_kana IS NULL OR char_length(first_name_kana) <= 50) NOT VALID,
    ADD CONSTRAINT chk_visitors_company_len     CHECK (company_name IS NULL OR char_length(company_name) <= 100) NOT VALID,
    ADD CONSTRAINT chk_visitors_company_kana_len CHECK (company_kana IS NULL OR char_length(company_kana) <= 100) NOT VALID,
    ADD CONSTRAINT chk_visitors_department_len  CHECK (department IS NULL OR char_length(department) <= 100) NOT VALID,
    ADD CONSTRAINT chk_visitors_position_len    CHECK (position IS NULL OR char_length(position) <= 100) NOT VALID,
    ADD CONSTRAINT chk_visitors_address_len     CHECK (address IS NULL OR char_length(address) <= 200) NOT VALID;

-- ---- visitors: 形式制約 ----
ALTER TABLE visitors
    ADD CONSTRAINT chk_visitors_phone_format CHECK (
        phone IS NULL OR phone ~ '^[0-9-]{1,20}$'
    ) NOT VALID,
    ADD CONSTRAINT chk_visitors_postal_format CHECK (
        postal_code IS NULL OR postal_code ~ '^[0-9]{3}-?[0-9]{4}$'
    ) NOT VALID;

-- ---- registrations: 文字数・形式・JSONB構造 ----
ALTER TABLE registrations
    ADD CONSTRAINT chk_registrations_industry_len CHECK (
        industry IS NULL OR char_length(industry) <= 50
    ) NOT VALID,
    ADD CONSTRAINT chk_registrations_ticket_format CHECK (
        ticket_code ~ '^[A-Z0-9]{8}$'
    ) NOT VALID,
    ADD CONSTRAINT chk_registrations_companions_array CHECK (
        jsonb_typeof(companions) = 'array'
    ) NOT VALID,
    ADD CONSTRAINT chk_registrations_custom_fields_object CHECK (
        jsonb_typeof(custom_fields) = 'object'
    ) NOT VALID;

-- ---- entry_logs: ゲート名の上限 ----
ALTER TABLE entry_logs
    ADD CONSTRAINT chk_entry_logs_gate_len CHECK (
        gate IS NULL OR char_length(gate) <= 50
    ) NOT VALID;
