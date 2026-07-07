import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireExhibitorApi } from "@/lib/exhibitor-auth";

// リード一覧（リードリトリーバル・GATEオプション）

export async function GET() {
  const auth = await requireExhibitorApi();
  if (auth instanceof NextResponse) return auth;

  const { data: leads, error } = await supabaseAdmin
    .from("exhibitor_leads")
    .select(
      `
      id, note, scanned_at,
      registration:registrations!inner(
        id, ticket_code, industry, visit_purpose,
        visitor:visitors!inner(last_name, first_name, last_name_kana, first_name_kana, company_name, department, position, email, phone)
      )
    `,
    )
    .eq("exhibitor_id", auth.exhibitor_id)
    .order("scanned_at", { ascending: false });

  if (error) {
    console.error("Leads query error:", error);
    return NextResponse.json(
      { error: "データの取得に失敗しました" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    exhibitor: {
      name: auth.name,
      booth_number: auth.booth_number,
      exhibition_name: auth.exhibition_name,
    },
    leads: leads || [],
  });
}
