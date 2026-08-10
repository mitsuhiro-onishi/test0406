-- ============================================================
-- 008: Atomic check-in with 30-minute dedup window
-- ============================================================
--
-- 背景（レビュー2026-08-08 P1-8）: 判定とINSERTが別クエリのため、複数の
-- 受付端末が同時に同じQRを読むと両方「初入場」になり入場ログが二重化した。
--
-- 仕様（大西さん指定 2026-08-09）:
--   1. 初回スキャン → 入場（entry）としてログを作成
--   2. 直近の入場から p_dedup_window_minutes（既定30分）以内の再スキャンは
--      同一入場とみなし、既存ログの時刻・端末情報を上書きする（件数は増えない）。
--      30分ちょうどはウィンドウ内（merged）。ウィンドウは直近入場からの
--      スライド式（上書きのたびに起点も進む）
--   3. それ以降の再スキャン、または退場（exit）記録後のスキャンは
--      再入場として新しい入場ログを作成する
--
-- registrations の行ロックで判定〜書き込みを直列化し（check-then-insert
-- 競合の根本対策）、あわせてキャンセル済み判定もロック下で行う。
-- 呼び出しは service_role のみ（RLSバイパス済みのため SECURITY INVOKER）。

CREATE OR REPLACE FUNCTION checkin_atomic(
    p_registration_id UUID,
    p_gate TEXT,
    p_method TEXT,
    p_scanned_by UUID,
    p_dedup_window_minutes INTEGER DEFAULT 30
)
RETURNS TABLE (result TEXT, previous_logged_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    reg_status TEXT;
    latest_log RECORD;
    latest_entry RECORD;
    v_now TIMESTAMPTZ;
BEGIN
    IF p_registration_id IS NULL THEN
        RAISE EXCEPTION 'registration_id_required' USING ERRCODE = 'P0001';
    END IF;
    IF p_method IS NULL THEN
        RAISE EXCEPTION 'method_required' USING ERRCODE = 'P0001';
    END IF;
    IF p_dedup_window_minutes IS NULL OR p_dedup_window_minutes < 0 THEN
        RAISE EXCEPTION 'invalid_dedup_window' USING ERRCODE = 'P0001';
    END IF;

    -- 登録行ロックで同一登録のチェックインを直列化（トランザクション終了で解放）。
    -- ロック下で状態も再検証し、判定直前のキャンセルを取りこぼさない。
    SELECT status INTO reg_status
      FROM registrations
     WHERE id = p_registration_id
     FOR UPDATE;

    IF reg_status IS NULL THEN
        RETURN QUERY SELECT 'not_found'::TEXT, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;
    IF reg_status = 'cancelled' THEN
        RETURN QUERY SELECT 'cancelled'::TEXT, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    -- ロック取得後の実時刻で統一（NOW()はトランザクション開始時刻のため、
    -- ロック待ちが長いと過去の時刻を記録してしまう）
    v_now := clock_timestamp();

    -- 最新ログ（entry/exit問わず）と最新のentryをそれぞれ取得
    SELECT id, action, logged_at INTO latest_log
      FROM entry_logs
     WHERE registration_id = p_registration_id
     ORDER BY logged_at DESC
     LIMIT 1;

    SELECT id, logged_at INTO latest_entry
      FROM entry_logs
     WHERE registration_id = p_registration_id
       AND action = 'entry'
     ORDER BY logged_at DESC
     LIMIT 1;

    IF latest_entry.id IS NULL THEN
        -- 初入場
        INSERT INTO entry_logs (registration_id, action, gate, method, scanned_by, logged_at)
        VALUES (p_registration_id, 'entry', p_gate, p_method, p_scanned_by, v_now);
        RETURN QUERY SELECT 'entry'::TEXT, NULL::TIMESTAMPTZ;
    ELSIF latest_log.action = 'exit' THEN
        -- 退場記録後のスキャンはウィンドウに関係なく再入場
        INSERT INTO entry_logs (registration_id, action, gate, method, scanned_by, logged_at)
        VALUES (p_registration_id, 'entry', p_gate, p_method, p_scanned_by, v_now);
        RETURN QUERY SELECT 'reentry'::TEXT, latest_entry.logged_at;
    ELSIF latest_entry.logged_at >= v_now - make_interval(mins => p_dedup_window_minutes) THEN
        -- ウィンドウ内の重複スキャン（別端末の二重読み等）: 同一入場として時刻を上書き
        UPDATE entry_logs
           SET logged_at = v_now,
               gate = p_gate,
               method = p_method,
               scanned_by = p_scanned_by
         WHERE id = latest_entry.id;
        RETURN QUERY SELECT 'merged'::TEXT, latest_entry.logged_at;
    ELSE
        -- ウィンドウ超過: 再入場として新規ログを作成
        INSERT INTO entry_logs (registration_id, action, gate, method, scanned_by, logged_at)
        VALUES (p_registration_id, 'entry', p_gate, p_method, p_scanned_by, v_now);
        RETURN QUERY SELECT 'reentry'::TEXT, latest_entry.logged_at;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION checkin_atomic(UUID, TEXT, TEXT, UUID, INTEGER)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION checkin_atomic(UUID, TEXT, TEXT, UUID, INTEGER)
    TO service_role;
