import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth";
import { isValidUuid } from "@/lib/validation";
import { getAuthorizedExhibitionIds } from "@/lib/admin-scope-server";

// 聴講実績: セミナーの予約一覧（GATEオプション）

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
    .select("id, exhibition_id, title, capacity, starts_at, ends_at, status, venue_name")
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
        id, ticket_code, status,
        visitor:visitors!inner(last_name, first_name, last_name_kana, first_name_kana, company_name, email)
      )
    `,
    )
    .eq("seminar_id", id)
    .order("booked_at", { ascending: true });

  if (error) {
    console.error("Seminar bookings query error:", error);
    return NextResponse.json(
      { error: "データの取得に失敗しました" },
      { status: 500 },
    );
  }

  return NextResponse.json({ seminar, bookings: bookings || [] });
}
