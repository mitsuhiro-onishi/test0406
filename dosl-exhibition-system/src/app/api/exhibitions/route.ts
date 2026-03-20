import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("exhibitions")
    .select("id, name, slug, status, start_date, end_date")
    .order("start_date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ exhibitions: data });
}
