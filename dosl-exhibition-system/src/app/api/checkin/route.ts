import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth";
import {
  CHECKIN_METHODS,
  cleanText,
  isValidTicketCode,
  MAX_LEN,
} from "@/lib/validation";

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

    // 既に入場済みかチェック
    const { data: lastEntry } = await supabaseAdmin
      .from("entry_logs")
      .select("action")
      .eq("registration_id", registration.id)
      .order("logged_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const alreadyEntered = lastEntry?.action === "entry";

    // 入場ログを記録（誰がスキャンしたかも残す）
    const { error: logError } = await supabaseAdmin.from("entry_logs").insert({
      registration_id: registration.id,
      action: "entry",
      gate: gate || null,
      method,
      scanned_by: auth.user_id,
    });

    if (logError) {
      console.error("Entry log insert error:", logError);
      return NextResponse.json(
        { success: false, error: "入場記録の保存に失敗しました" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      already_entered: alreadyEntered,
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
