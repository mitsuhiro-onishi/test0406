import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth";
import {
  CHECKIN_METHODS,
  cleanText,
  isValidTicketCode,
  isValidUuid,
} from "@/lib/validation";

// セミナー当日受付（GATEオプション）
// 入場証（チケットコード）のQRをセミナー会場入口でスキャンし、
// 該当セミナーの予約に聴講実績（checked_in_at）を記録する。

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminApi();
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();

    const rawCode = cleanText(body.ticket_code);
    if (!rawCode) {
      return NextResponse.json(
        { success: false, error: "チケットコードが必要です" },
        { status: 400 },
      );
    }
    const ticketCode = rawCode.toUpperCase();
    if (!isValidTicketCode(ticketCode)) {
      return NextResponse.json(
        { success: false, error: "チケットコードは8文字の英数字です" },
        { status: 400 },
      );
    }

    if (!isValidUuid(body.seminar_id)) {
      return NextResponse.json(
        { success: false, error: "セミナーを選択してください" },
        { status: 400 },
      );
    }

    const method =
      body.method === undefined || body.method === null
        ? "qr"
        : (CHECKIN_METHODS as readonly string[]).includes(body.method)
          ? (body.method as string)
          : null;
    if (method === null) {
      return NextResponse.json(
        { success: false, error: "method の値が不正です" },
        { status: 400 },
      );
    }

    // セミナーの状態チェック
    const { data: seminar } = await supabaseAdmin
      .from("seminars")
      .select("id, exhibition_id, title, starts_at, ends_at, status, venue_name")
      .eq("id", body.seminar_id)
      .maybeSingle();

    if (!seminar) {
      return NextResponse.json(
        { success: false, error: "セミナーが見つかりません" },
        { status: 404 },
      );
    }
    if (seminar.status === "cancelled" || seminar.status === "draft") {
      return NextResponse.json(
        { success: false, error: "このセミナーは受付できません" },
        { status: 400 },
      );
    }

    // チケットから登録情報を取得
    const { data: registration } = await supabaseAdmin
      .from("registrations")
      .select(
        `
        id, ticket_code, status, exhibition_id,
        visitor:visitors(last_name, first_name, company_name),
        registration_type:registration_types(name, color)
      `,
      )
      .eq("ticket_code", ticketCode)
      .maybeSingle();

    if (!registration) {
      return NextResponse.json(
        { success: false, error: "無効なチケットコードです" },
        { status: 404 },
      );
    }
    if (registration.status === "cancelled") {
      return NextResponse.json(
        { success: false, error: "この登録はキャンセルされています" },
        { status: 400 },
      );
    }
    if (registration.exhibition_id !== seminar.exhibition_id) {
      return NextResponse.json(
        { success: false, error: "別の展示会のチケットです" },
        { status: 400 },
      );
    }

    // 予約の確認
    const { data: booking } = await supabaseAdmin
      .from("seminar_bookings")
      .select("id, status, checked_in_at")
      .eq("seminar_id", seminar.id)
      .eq("registration_id", registration.id)
      .maybeSingle();

    if (!booking) {
      return NextResponse.json(
        { success: false, error: "このセミナーの予約がありません" },
        { status: 404 },
      );
    }
    if (booking.status === "cancelled") {
      return NextResponse.json(
        { success: false, error: "この予約はキャンセルされています" },
        { status: 400 },
      );
    }
    if (booking.status === "waitlisted") {
      return NextResponse.json(
        { success: false, error: "ウェイトリストの予約のため受付できません" },
        { status: 400 },
      );
    }

    const alreadyCheckedIn = booking.checked_in_at != null;

    if (!alreadyCheckedIn) {
      const { error: updateError } = await supabaseAdmin
        .from("seminar_bookings")
        .update({ checked_in_at: new Date().toISOString() })
        .eq("id", booking.id);

      if (updateError) {
        console.error("Seminar checkin update error:", updateError);
        return NextResponse.json(
          { success: false, error: "聴講記録の保存に失敗しました" },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      success: true,
      already_checked_in: alreadyCheckedIn,
      seminar: {
        id: seminar.id,
        title: seminar.title,
        venue_name: seminar.venue_name,
        starts_at: seminar.starts_at,
      },
      registration: {
        id: registration.id,
        ticket_code: registration.ticket_code,
        visitor: registration.visitor,
        registration_type: registration.registration_type,
      },
    });
  } catch (err) {
    console.error("Seminar checkin API error:", err);
    return NextResponse.json(
      { success: false, error: "サーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
