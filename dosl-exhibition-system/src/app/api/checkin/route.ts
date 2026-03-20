import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const { ticket_code, gate, method } = await request.json();

    if (!ticket_code) {
      return NextResponse.json(
        { success: false, error: "チケットコードが必要です" },
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
      .eq("ticket_code", ticket_code.toUpperCase().trim())
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
      .single();

    const alreadyEntered = lastEntry?.action === "entry";

    // 入場ログを記録
    await supabaseAdmin.from("entry_logs").insert({
      registration_id: registration.id,
      action: "entry",
      gate: gate || null,
      method: method || "qr",
    });

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
