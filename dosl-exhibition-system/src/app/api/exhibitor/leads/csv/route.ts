import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireExhibitorApi } from "@/lib/exhibitor-auth";
import { buildCsv, jstDateString, jstDateTime } from "@/lib/csv";

// リードCSV（リードリトリーバル・GATEオプション）

interface LeadRow {
  note: string | null;
  scanned_at: string;
  registration: {
    ticket_code: string;
    industry: string | null;
    visit_purpose: string[] | null;
    visitor: {
      last_name: string;
      first_name: string;
      last_name_kana: string | null;
      first_name_kana: string | null;
      company_name: string | null;
      department: string | null;
      position: string | null;
      email: string;
      phone: string | null;
    };
  };
}

export async function GET() {
  const auth = await requireExhibitorApi();
  if (auth instanceof NextResponse) return auth;

  const { data: leads, error } = await supabaseAdmin
    .from("exhibitor_leads")
    .select(
      `
      note, scanned_at,
      registration:registrations!inner(
        ticket_code, industry, visit_purpose,
        visitor:visitors!inner(last_name, first_name, last_name_kana, first_name_kana, company_name, department, position, email, phone)
      )
    `,
    )
    .eq("exhibitor_id", auth.exhibitor_id)
    .order("scanned_at", { ascending: false });

  if (error) {
    console.error("Leads CSV query error:", error);
    return NextResponse.json(
      { error: "データの取得に失敗しました" },
      { status: 500 },
    );
  }

  const headers = [
    "スキャン日時",
    "姓",
    "名",
    "セイ",
    "メイ",
    "会社名",
    "部署",
    "役職",
    "メールアドレス",
    "電話番号",
    "業種",
    "来場目的",
    "メモ",
  ];

  const rows = ((leads || []) as unknown as LeadRow[]).map((l) => {
    const v = l.registration.visitor;
    return [
      jstDateTime(l.scanned_at),
      v.last_name,
      v.first_name,
      v.last_name_kana,
      v.first_name_kana,
      v.company_name,
      v.department,
      v.position,
      v.email,
      v.phone,
      l.registration.industry,
      l.registration.visit_purpose?.join("、"),
      l.note,
    ];
  });

  const csv = buildCsv(headers, rows);
  const filename = `leads_${jstDateString()}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
