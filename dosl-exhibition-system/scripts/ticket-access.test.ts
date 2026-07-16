import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ticketPage = readFileSync(
  new URL("../src/app/[slug]/ticket/[code]/page.tsx", import.meta.url),
  "utf8",
);

test("チケット画面: ticket_codeだけでなく展示会slugも一致した登録だけを取得する", () => {
  assert.match(ticketPage, /exhibition:exhibitions!inner\(\*\)/);
  assert.match(ticketPage, /\.eq\("exhibition\.slug", slug\)/);
  assert.doesNotMatch(
    ticketPage,
    /exhibition:exhibitions\(\*\)/,
    "left joinではslug不一致時にも登録本体が返り得る",
  );
});

test("チケット画面: 期限付き署名を検証し、署名なしURLを表示しない", () => {
  assert.match(ticketPage, /verifyTicketLinkSignature\(/);
  assert.match(ticketPage, /searchParams: Promise/);

  const emailSource = readFileSync(
    new URL("../src/lib/email.ts", import.meta.url),
    "utf8",
  );
  assert.match(emailSource, /buildSignedTicketUrl\(/);

  const adminPage = readFileSync(
    new URL(
      "../src/app/admin/(protected)/registrations/page.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(adminPage, /href=\{r\.ticket_url\}/);
  assert.doesNotMatch(adminPage, /ticket\/\$\{r\.ticket_code\}/);
});
