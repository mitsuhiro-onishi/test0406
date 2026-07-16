import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/007_atomic_limits.sql",
  import.meta.url,
);

test("DBが展示会・セミナー定員を親行ロック下で原子的に検証する", () => {
  assert.ok(existsSync(migrationUrl), "原子的な定員ガードmigrationが必要");
  const sql = readFileSync(migrationUrl, "utf8");
  assert.match(sql, /enforce_exhibition_registration_capacity/);
  assert.match(sql, /enforce_seminar_booking_capacity/);
  assert.match(sql, /FOR UPDATE/);
  assert.match(sql, /CREATE TRIGGER trg_enforce_registration_capacity/);
  assert.match(sql, /CREATE TRIGGER trg_enforce_seminar_capacity/);

  const registerRoute = readFileSync(
    new URL("../src/app/api/register/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(registerRoute, /isCapacityError\([^,]+, "exhibition"\)/);
  assert.match(registerRoute, /isCapacityError\([^,]+, "seminar"\)/);
  assert.match(registerRoute, /status: "waitlisted"/);
});

test("レート制限はservice role専用のDB関数で全インスタンス共有する", () => {
  assert.ok(existsSync(migrationUrl), "共有レート制限migrationが必要");
  const sql = readFileSync(migrationUrl, "utf8");
  assert.match(sql, /CREATE TABLE api_rate_limit_buckets/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION consume_api_rate_limit/);
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /REVOKE ALL ON FUNCTION consume_api_rate_limit/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION consume_api_rate_limit[^;]+ TO service_role/);

  for (const relativePath of [
    "../src/app/api/register/route.ts",
    "../src/app/api/auth/login/route.ts",
    "../src/app/api/exhibitor/login/route.ts",
  ]) {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    assert.match(source, /await consumeRateLimit\(/);
  }
});
