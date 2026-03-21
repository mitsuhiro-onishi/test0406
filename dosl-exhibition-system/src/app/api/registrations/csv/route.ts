import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const exhibition_id = searchParams.get("exhibition_id");
  const status = searchParams.get("status");
  const q = searchParams.get("q")?.trim();

  let query = supabaseAdmin
    .from("registrations")
    .select(
      `
      *,
      visitor:visitors!inner(*),
      exhibition:exhibitions(id, name, slug),
      registration_type:registration_types(name, color)
    `,
    );

  if (exhibition_id) {
    query = query.eq("exhibition_id", exhibition_id);
  }
  if (status) {
    query = query.eq("status", status);
  }
  if (q) {
    query = query.or(
      `last_name.ilike.%${q}%,first_name.ilike.%${q}%,company_name.ilike.%${q}%,email.ilike.%${q}%`,
      { foreignTable: "visitors" },
    );
  }

  query = query.order("registered_at", { ascending: false });

  const { data, error } = await query;

  if (error) {
    console.error("CSV export query error:", error);
    return NextResponse.json(
      { error: "データの取得に失敗しました" },
      { status: 500 },
    );
  }

  const rows = data || [];

  // BOM + ヘッダー行
  const headers = [
    "チケットコード",
    "ステータス",
    "姓",
    "名",
    "セイ",
    "メイ",
    "メールアドレス",
    "会社名",
    "部署",
    "役職",
    "電話番号",
    "郵便番号",
    "住所",
    "業種",
    "来場目的",
    "登録種別",
    "同伴者",
    "展示会",
    "登録日時",
  ];

  function csvEscape(val: string | null | undefined): string {
    if (val == null) return "";
    const s = String(val);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  const csvRows = rows.map((r) => {
    const v = r.visitor;
    return [
      r.ticket_code,
      r.status === "confirmed"
        ? "登録済"
        : r.status === "cancelled"
          ? "キャンセル"
          : r.status,
      v.last_name,
      v.first_name,
      v.last_name_kana,
      v.first_name_kana,
      v.email,
      v.company_name,
      v.department,
      v.position,
      v.phone,
      v.postal_code,
      v.address,
      r.industry,
      r.visit_purpose?.join("、"),
      r.registration_type?.name,
      r.companions?.map((c: { name: string }) => c.name).join("、"),
      r.exhibition?.name,
      r.registered_at
        ? new Date(r.registered_at).toLocaleString("ja-JP", {
            timeZone: "Asia/Tokyo",
          })
        : "",
    ]
      .map(csvEscape)
      .join(",");
  });

  const bom = "\uFEFF";
  const csv = bom + headers.map(csvEscape).join(",") + "\n" + csvRows.join("\n");

  const filename = `registrations_${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
