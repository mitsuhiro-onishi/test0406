import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth";

// 管理画面用の展示会一覧（下書き含む全ステータスを返すため認証必須）
export async function GET() {
  const auth = await requireAdminApi();
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await supabaseAdmin
    .from("exhibitions")
    .select("id, name, slug, status, start_date, end_date")
    .order("start_date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ exhibitions: data });
}
