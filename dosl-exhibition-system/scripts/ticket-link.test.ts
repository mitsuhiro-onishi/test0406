import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSignedTicketUrl,
  createTicketLinkSignature,
  getTicketLinkExpiry,
  verifyTicketLinkSignature,
} from "../src/lib/ticket-link.ts";

const secret = "test-ticket-link-secret-at-least-32-bytes";
const claims = {
  slug: "sample-event",
  code: "ABCD2345",
  expires: 1_800_000_000,
  registrationUpdatedAt: "2026-07-16T00:00:00.000Z",
};

test("ticket link署名はslug/code/期限/更新版の改ざんを拒否する", () => {
  const signature = createTicketLinkSignature(claims, secret);
  assert.equal(
    verifyTicketLinkSignature(claims, signature, secret, 1_700_000_000_000),
    true,
  );
  for (const changed of [
    { ...claims, slug: "other-event" },
    { ...claims, code: "ZZZZ9999" },
    { ...claims, expires: claims.expires + 1 },
    { ...claims, registrationUpdatedAt: "2026-07-16T00:00:01.000Z" },
  ]) {
    assert.equal(
      verifyTicketLinkSignature(changed, signature, secret, 1_700_000_000_000),
      false,
    );
  }
  assert.equal(
    verifyTicketLinkSignature(claims, signature, secret, 1_900_000_000_000),
    false,
  );
});

test("署名URLは展示会終了後まで有効でsecretを含まない", () => {
  const now = Date.parse("2026-07-16T00:00:00Z");
  const expires = getTicketLinkExpiry("2026-08-01", now);
  assert.ok(expires * 1000 > Date.parse("2026-08-01T23:59:59+09:00"));

  const url = buildSignedTicketUrl(
    {
      baseUrl: "https://gate.example.com",
      ...claims,
      expires,
    },
    secret,
  );
  const parsed = new URL(url);
  assert.equal(parsed.pathname, "/sample-event/ticket/ABCD2345");
  assert.equal(parsed.searchParams.get("expires"), String(expires));
  assert.match(parsed.searchParams.get("signature") ?? "", /^[A-Za-z0-9_-]{43}$/);
  assert.equal(url.includes(secret), false);
});

