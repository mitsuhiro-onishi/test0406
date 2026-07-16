import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const nextConfig = require("../next.config.js");

test("全ページに基本セキュリティヘッダーを付与する", async () => {
  assert.equal(nextConfig.poweredByHeader, false);
  assert.equal(typeof nextConfig.headers, "function");
  const rules = await nextConfig.headers();
  const globalRule = rules.find(
    (rule: { source?: string }) => rule.source === "/:path*",
  );
  assert.ok(globalRule, "全パス対象のルールが必要");

  const headers = new Map<string, string>(
    globalRule.headers.map(
      ({ key, value }: { key: string; value: string }) => [
        key.toLowerCase(),
        value,
      ],
    ),
  );

  assert.equal(headers.get("x-content-type-options"), "nosniff");
  assert.equal(headers.get("x-frame-options"), "DENY");
  assert.equal(headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.match(headers.get("strict-transport-security") ?? "", /max-age=/);
  assert.match(headers.get("permissions-policy") ?? "", /camera=\(self\)/);

  const csp = headers.get("content-security-policy") ?? "";
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /base-uri 'self'/);
});
