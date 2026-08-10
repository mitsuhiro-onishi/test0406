import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth";
import {
  CHECKIN_METHODS,
  cleanText,
  isValidTicketCode,
  MAX_LEN,
} from "@/lib/validation";
import { getAuthorizedExhibitionIds } from "@/lib/admin-scope-server";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminApi();
    if (auth instanceof NextResponse) return auth;
    const allowedIds = await getAuthorizedExhibitionIds(auth);

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

    // method ホワイトリスト検証（既定は qr）
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

    const gate = cleanText(body.gate);
    if (gate && gate.length > MAX_LEN.gate) {
      return NextResponse.json(
        { success: false, error: "gate の値が不正です" },
        { status: 400 },
      );
    }

    // 登録情報を取得
    const { data: registration, error: regError } = await supabaseAdmin
      .from("registrations")
      .select(
        `
        *,
        visitor:visitors(*),
        exhibition:exhibitions(name, slug),
        registration_type:registration_types(name, color)
      `,
      )
      .eq("ticket_code", ticketCode)
      .in("exhibition_id", allowedIds)
      .single();

    if (regError || !registration) {
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

    // 入場判定と記録をDB関数で原子的に行う（migration 008）。
    // 複数端末の同時スキャンでも登録単位で直列化され、
    // 30分以内の重複は同一入場として時刻上書き・30分超は再入場になる。
    const { data: checkinRows, error: logError } = await supabaseAdmin.rpc(
      "checkin_atomic",
      {
        p_registration_id: registration.id,
        p_gate: gate || null,
        p_method: method,
        p_scanned_by: auth.user_id,
      },
    );

    if (logError || !checkinRows?.[0]) {
      console.error("Atomic checkin error:", logError);
      return NextResponse.json(
        { success: false, error: "入場記録の保存に失敗しました" },
        { status: 500 },
      );
    }

    const checkin = checkinRows[0] as {
      result: "entry" | "merged" | "reentry" | "cancelled" | "not_found";
      previous_logged_at: string | null;
    };

    // ロック下の再検証結果（判定直前のキャンセル・削除を取りこぼさない）
    if (checkin.result === "cancelled") {
      return NextResponse.json(
        { success: false, error: "この登録はキャンセルされています" },
        { status: 400 },
      );
    }
    if (checkin.result === "not_found") {
      return NextResponse.json(
        { success: false, error: "無効なチケットコードです" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      // 旧API契約を維持: スキャン前に入場記録があれば true（merged/reentry とも）。
      // 表示の出し分けは checkin_result を使う
      already_entered: checkin.result !== "entry",
      checkin_result: checkin.result,
      previous_entry_at: checkin.previous_logged_at,
      registration: {
        id: registration.id,
        ticket_code: registration.ticket_code,
        visitor: registration.visitor,
        exhibition: registration.exhibition,
        registration_type: registration.registration_type,
        companions: registration.companions,
      },
    });
  } catch (err) {
    console.error("Checkin API error:", err);
    return NextResponse.json(
      { success: false, error: "サーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
