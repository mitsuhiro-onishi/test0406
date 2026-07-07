import { randomInt } from "crypto";

// 出展社アクセスコードの生成（リードリトリーバル・GATEオプション）
// チケットコードと同じ紛らわしい文字（0/O、1/I/L）を除いた32文字×12桁 ≈ 60bit

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ACCESS_CODE_LENGTH = 12;

export function generateAccessCode(): string {
  let code = "";
  for (let i = 0; i < ACCESS_CODE_LENGTH; i++) {
    code += CHARS[randomInt(CHARS.length)];
  }
  return code;
}
