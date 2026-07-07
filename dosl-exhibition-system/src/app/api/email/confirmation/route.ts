import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { sendConfirmationEmail } from "@/lib/email";
import { cleanText } from "@/lib/validation";

// 管理画面の「通知」ボタンからの手動送信用。
// 登録完了時の自動送信は /api/register が lib/email を直接呼ぶ。
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminApi();
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();
    const registrationId = cleanText(body.registration_id);

    if (!registrationId) {
      return NextResponse.json(
        { success: false, error: "registration_id が必要です" },
        { status: 400 },
      );
    }

    const result = await sendConfirmationEmail(registrationId);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status || 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Send confirmation email error:", err);
    return NextResponse.json(
      { success: false, error: "サーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
