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

