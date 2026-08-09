import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireExhibitorApi } from "@/lib/exhibitor-auth";
import { cleanText, isValidTicketCode } from "@/lib/validation";

// リードスキャン（リードリトリーバル・GATEオプション）
// 来場者のQR入場証（チケットコード）を読み取り、リードとして記録する。
// 同一来場者の再スキャンは already_scanned=true で既存リードを返す。

interface VisitorInfo {
  last_name: string;
  first_name: string;
  last_name_kana: string | null;
  first_name_kana: string | null;
  company_name: string | null;
  department: string | null;
  position: string | null;
  email: string;
  phone: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireExhibitorApi();
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

    // チケットから登録を取得
    const { data: registration } = await supabaseAdmin
      .from("registrations")
      .select(
        `
        id, ticket_code, status, exhibition_id, industry, visit_purpose, custom_fields,
        visitor:visitors(last_name, first_name, last_name_kana, first_name_kana, company_name, department, position, email, phone)
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
    // 別展示会のチケットは読み取らせない
    if (registration.exhibition_id !== auth.exhibition_id) {
      return NextResponse.json(
        { success: false, error: "この展示会のチケットではありません" },
        { status: 400 },
      );
    }

    // 出展社への情報提供に同意した登録のみリード化できる。
    // 同意記録は登録時に lead_retrieval が有効だった場合のみ保存されるため、
    // フラグを後からONにした展示会の既存登録者は同意なし＝提供不可になる。
    const leadConsent = (
      registration.custom_fields as
        | { lead_consent?: { agreed?: boolean } }
        | null
        | undefined
    )?.lead_consent;
    if (leadConsent?.agreed !== true) {
      return NextResponse.json(
        {
          success: false,
          error:
            "この来場者は出展社への情報提供に同意していないため、リード登録できません",
        },
        { status: 403 },
      );
    }

    const visitor = registration.visitor as unknown as VisitorInfo;

    // リード登録（重複は既存を返す）
    const { data: lead, error: insertError } = await supabaseAdmin
      .from("exhibitor_leads")
      .insert({
        exhibitor_id: auth.exhibitor_id,
        registration_id: registration.id,
      })
      .select("id, note, scanned_at")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        const { data: existing } = await supabaseAdmin
          .from("exhibitor_leads")
          .select("id, note, scanned_at")
          .eq("exhibitor_id", auth.exhibitor_id)
          .eq("registration_id", registration.id)
          .maybeSingle();
        return NextResponse.json({
          success: true,
          already_scanned: true,
          lead: existing,
          visitor,
        });
      }
      console.error("Lead insert error:", insertError);
      return NextResponse.json(
        { success: false, error: "リードの保存に失敗しました" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      already_scanned: false,
      lead,
      visitor,
    });
  } catch (err) {
    console.error("Lead scan API error:", err);
    return NextResponse.json(
      { success: false, error: "サーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
