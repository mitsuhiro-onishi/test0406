import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth";
import { REGISTRATION_STATUSES, sanitizeSearchTerm } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const auth = await requireAdminApi();
  if (auth instanceof NextResponse) return auth;

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
  if (status && (REGISTRATION_STATUSES as readonly string[]).includes(status)) {
    query = query.eq("status", status);
  }
  if (q) {
    const term = sanitizeSearchTerm(q);
    if (term) {
      query = query.or(
        `last_name.ilike.%${term}%,first_name.ilike.%${term}%,company_name.ilike.%${term}%,email.ilike.%${term}%`,
        { foreignTable: "visitors" },
      );
    }
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
    let s = String(val);
    // Excel数式インジェクション対策: 先頭が = + - @ の場合はタブを前置しない方式でなく
    // シングルクォートを前置して数式評価を防ぐ
    if (/^[=+\-@]/.test(s)) {
      s = `'${s}`;
    }
    if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
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
          : r.status === "waitlisted"
            ? "ウェイトリスト"
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

  // ファイル名の日付はJST基準
  const jstDate = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
  }).format(new Date());
  const filename = `registrations_${jstDate}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
