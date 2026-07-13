// 管理者パスワードの再設定スクリプト
// 使い方: node scripts/set-admin-password.mjs
// 対象: mituhi3216@gmail.com（admin_users owner）
// パスワードは実行時にターミナルで入力する（このファイルにもチャットにも残さない）
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

const ADMIN_USER_ID = "32ba55af-3975-4488-8354-5fff6ccca379"; // mituhi3216@gmail.com

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

const rl = createInterface({ input: process.stdin, output: process.stdout });
const password = await rl.question("新しいパスワード（8文字以上）: ");
rl.close();

if (password.length < 8) {
  console.error("8文字以上にしてください。やり直してください。");
  process.exit(1);
}

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { error } = await db.auth.admin.updateUserById(ADMIN_USER_ID, { password });
if (error) {
  console.error("更新に失敗:", error.message);
  process.exit(1);
}
console.log("✅ パスワードを更新しました。https://dosl-gate.vercel.app/admin/login からログインできます。");
