-- ============================================================
-- 007: Atomic capacity guards and distributed API rate limits
-- ============================================================

-- Parent-row locks serialize capacity decisions for the same exhibition or
-- seminar. The API's earlier count checks remain useful for friendly errors,
-- while these triggers close the concurrent check-then-insert race.

CREATE OR REPLACE FUNCTION enforce_exhibition_registration_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    capacity_limit INTEGER;
    confirmed_count BIGINT;
BEGIN
    IF NEW.status <> 'confirmed' THEN
        RETURN NEW;
    END IF;

    SELECT max_registrations
      INTO capacity_limit
      FROM exhibitions
     WHERE id = NEW.exhibition_id
     FOR UPDATE;

    IF capacity_limit IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT COUNT(*)
      INTO confirmed_count
      FROM registrations
     WHERE exhibition_id = NEW.exhibition_id
       AND status = 'confirmed'
       AND id <> NEW.id;

    IF confirmed_count >= capacity_limit THEN
        RAISE EXCEPTION 'exhibition_capacity_reached' USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_registration_capacity
    BEFORE INSERT OR UPDATE OF exhibition_id, status ON registrations
    FOR EACH ROW EXECUTE FUNCTION enforce_exhibition_registration_capacity();

CREATE OR REPLACE FUNCTION enforce_seminar_booking_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    capacity_limit INTEGER;
    confirmed_count BIGINT;
BEGIN
    IF NEW.status <> 'confirmed' THEN
        RETURN NEW;
    END IF;

    SELECT capacity
      INTO capacity_limit
      FROM seminars
     WHERE id = NEW.seminar_id
     FOR UPDATE;

    IF capacity_limit IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT COUNT(*)
      INTO confirmed_count
      FROM seminar_bookings
     WHERE seminar_id = NEW.seminar_id
       AND status = 'confirmed'
       AND id <> NEW.id;

    IF confirmed_count >= capacity_limit THEN
        RAISE EXCEPTION 'seminar_capacity_reached' USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_seminar_capacity
    BEFORE INSERT OR UPDATE OF seminar_id, status ON seminar_bookings
    FOR EACH ROW EXECUTE FUNCTION enforce_seminar_booking_capacity();

-- Only SHA-256 hashes of limiter keys are stored, so raw IP addresses and
-- account identifiers are not persisted in this operational table.
CREATE TABLE api_rate_limit_buckets (
    key_hash        TEXT PRIMARY KEY,
    request_count   INTEGER NOT NULL,
    reset_at        TIMESTAMPTZ NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT api_rate_limit_key_hash_format
        CHECK (key_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT api_rate_limit_request_count_positive
        CHECK (request_count > 0)
);

CREATE INDEX idx_api_rate_limit_buckets_reset
    ON api_rate_limit_buckets(reset_at);

ALTER TABLE api_rate_limit_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE api_rate_limit_buckets FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION consume_api_rate_limit(
    p_key_hash TEXT,
    p_limit INTEGER,
    p_window_seconds INTEGER
)
RETURNS TABLE(allowed BOOLEAN, retry_after_sec INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    current_count INTEGER;
    current_reset TIMESTAMPTZ;
BEGIN
    IF p_key_hash !~ '^[0-9a-f]{64}$'
       OR p_limit < 1 OR p_limit > 10000
       OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
        RAISE EXCEPTION 'invalid_rate_limit_parameters' USING ERRCODE = '22023';
    END IF;

    INSERT INTO api_rate_limit_buckets AS bucket (
        key_hash,
        request_count,
        reset_at,
        updated_at
    )
    VALUES (
        p_key_hash,
        1,
        NOW() + make_interval(secs => p_window_seconds),
        NOW()
    )
    ON CONFLICT (key_hash) DO UPDATE SET
        request_count = CASE
            WHEN bucket.reset_at <= NOW() THEN 1
            ELSE bucket.request_count + 1
        END,
        reset_at = CASE
            WHEN bucket.reset_at <= NOW()
                THEN NOW() + make_interval(secs => p_window_seconds)
            ELSE bucket.reset_at
        END,
        updated_at = NOW()
    RETURNING request_count, reset_at
         INTO current_count, current_reset;

    allowed := current_count <= p_limit;
    retry_after_sec := CASE
        WHEN allowed THEN 0
        ELSE GREATEST(1, CEIL(EXTRACT(EPOCH FROM (current_reset - NOW())))::INTEGER)
    END;

    -- Opportunistic bounded cleanup; correctness does not depend on it.
    IF random() < 0.01 THEN
        DELETE FROM api_rate_limit_buckets
         WHERE reset_at < NOW() - INTERVAL '1 day';
    END IF;

    RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION consume_api_rate_limit(TEXT, INTEGER, INTEGER)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION consume_api_rate_limit(TEXT, INTEGER, INTEGER)
    TO service_role;

