import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth";
import { isValidUuid } from "@/lib/validation";
import { buildCsv, jstDateString, jstDateTime } from "@/lib/csv";
import { getAuthorizedExhibitionIds } from "@/lib/admin-scope-server";

// 聴講実績CSV（GATEオプション）

const BOOKING_STATUS_LABELS: Record<string, string> = {
  confirmed: "予約済",
  waitlisted: "ウェイトリスト",
  cancelled: "キャンセル",
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireAdminApi();
  if (auth instanceof NextResponse) return auth;
  const allowedIds = await getAuthorizedExhibitionIds(auth);

  if (!isValidUuid(id)) {
    return NextResponse.json(
      { error: "セミナーが見つかりません" },
      { status: 404 },
    );
  }

  const { data: seminar } = await supabaseAdmin
    .from("seminars")
    .select("id, exhibition_id, title")
    .eq("id", id)
    .in("exhibition_id", allowedIds)
    .maybeSingle();

  if (!seminar) {
    return NextResponse.json(
      { error: "セミナーが見つかりません" },
      { status: 404 },
    );
  }

  const { data: bookings, error } = await supabaseAdmin
    .from("seminar_bookings")
    .select(
      `
      id, status, checked_in_at, booked_at,
      registration:registrations!inner(
        ticket_code,
        visitor:visitors!inner(last_name, first_name, last_name_kana, first_name_kana, company_name, email)
      )
    `,
    )
    .eq("seminar_id", id)
    .order("booked_at", { ascending: true });

  if (error) {
    console.error("Seminar bookings CSV query error:", error);
    return NextResponse.json(
      { error: "データの取得に失敗しました" },
      { status: 500 },
    );
  }

  const headers = [
    "セミナー",
    "チケットコード",
    "姓",
    "名",
    "セイ",
    "メイ",
    "会社名",
    "メールアドレス",
    "予約ステータス",
    "聴講",
    "チェックイン日時",
    "予約日時",
  ];

  type BookingRow = {
    status: string;
    checked_in_at: string | null;
    booked_at: string;
    registration: {
      ticket_code: string;
      visitor: {
        last_name: string;
        first_name: string;
        last_name_kana: string | null;
        first_name_kana: string | null;
        company_name: string | null;
        email: string;
      };
    };
  };

  const rows = ((bookings || []) as unknown as BookingRow[]).map((b) => {
    const v = b.registration.visitor;
    return [
      seminar.title,
      b.registration.ticket_code,
      v.last_name,
      v.first_name,
      v.last_name_kana,
      v.first_name_kana,
      v.company_name,
      v.email,
      BOOKING_STATUS_LABELS[b.status] || b.status,
      b.checked_in_at ? "聴講済" : "未聴講",
      jstDateTime(b.checked_in_at),
      jstDateTime(b.booked_at),
    ];
  });

  const csv = buildCsv(headers, rows);
  const filename = `seminar_bookings_${jstDateString()}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
