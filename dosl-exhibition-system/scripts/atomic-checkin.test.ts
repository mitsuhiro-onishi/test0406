import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/008_atomic_checkin.sql",
  import.meta.url,
);

test("チェックインは登録行ロック下で原子的に判定・記録する", () => {
  assert.ok(existsSync(migrationUrl), "原子的チェックインmigrationが必要");
  const sql = readFileSync(migrationUrl, "utf8");
  assert.match(sql, /CREATE OR REPLACE FUNCTION checkin_atomic/);
  // 登録行ロックで直列化＋キャンセルをロック下で再検証（TOCTOU対策）
  assert.match(sql, /FROM registrations\s+WHERE id = p_registration_id\s+FOR UPDATE/);
  assert.match(sql, /'cancelled'::TEXT/);
  // service role専用・INVOKERで権限を広げない
  assert.match(sql, /SECURITY INVOKER/);
  assert.match(sql, /p_dedup_window_minutes INTEGER DEFAULT 30/);
  assert.match(sql, /REVOKE ALL ON FUNCTION checkin_atomic/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION checkin_atomic[^;]+TO service_role/);
});

test("30分以内は時刻上書き・30分超とexit後は再入場として分岐する", () => {
  const sql = readFileSync(migrationUrl, "utf8");
  // ロック待ちを考慮した実時刻で統一
  assert.match(sql, /clock_timestamp\(\)/);
  // ウィンドウ内（境界含む >=）: 既存ログをUPDATE（件数を増やさない）
  assert.match(sql, /logged_at >= v_now - make_interval\(mins => p_dedup_window_minutes\)/);
  assert.match(sql, /UPDATE entry_logs\s+SET logged_at = v_now/);
  assert.match(sql, /'merged'::TEXT/);
  // ウィンドウ超過・exit後: 新規INSERTで再入場
  assert.match(sql, /'reentry'::TEXT/);
  assert.match(sql, /latest_log\.action = 'exit'/);
});

test("チェックインAPIはRPC経由のみで入場を記録する", () => {
  const route = readFileSync(
    new URL("../src/app/api/checkin/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /\.rpc\(\s*"checkin_atomic"/);
  // check-then-insert競合の再発防止: 直接INSERTを残さない
  assert.doesNotMatch(route, /from\("entry_logs"\)\.insert/);
  // 旧API契約を維持: スキャン前に入場記録があればtrue（merged/reentryとも）
  assert.match(route, /already_entered: checkin\.result !== "entry"/);
  // ロック下の再検証結果を反映
  assert.match(route, /checkin\.result === "cancelled"/);
});

test("受付画面はmergedとreentryを区別して表示する", () => {
  const page = readFileSync(
    new URL(
      "../src/app/admin/(protected)/checkin/page.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  // 黄色表示・再入場バッジはreentryのみ（mergedは同一入場として緑）
  assert.doesNotMatch(page, /result\.already_entered\s*\?\s*"bg-yellow/);
  assert.match(page, /checkin_result === "reentry"/);
  assert.match(page, /同一入場・時刻を更新/);
  assert.match(page, /前回入場/);
});
