import { NextResponse } from "next/server";
import { clearExhibitorCookie } from "@/lib/exhibitor-auth";

// 出展社ログアウト（リードリトリーバル・GATEオプション）

export async function POST() {
  await clearExhibitorCookie();
  return NextResponse.json({ success: true });
}
