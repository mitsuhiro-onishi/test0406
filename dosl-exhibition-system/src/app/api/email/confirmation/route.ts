import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const { registration_id } = await request.json();

    if (!registration_id) {
      return NextResponse.json(
        { success: false, error: "registration_id が必要です" },
        { status: 400 },
      );
    }

    // 登録情報を取得
    const { data: registration, error: fetchError } = await supabaseAdmin
      .from("registrations")
      .select(
        `
        *,
        visitor:visitors(*),
        exhibition:exhibitions(*)
      `,
      )
      .eq("id", registration_id)
      .single();

    if (fetchError || !registration) {
      return NextResponse.json(
        { success: false, error: "登録情報が見つかりません" },
        { status: 404 },
      );
    }

    const visitor = registration.visitor;
    const exhibition = registration.exhibition;
    const branding = exhibition.branding;

    // Resend APIキーが設定されていなければスキップ
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return NextResponse.json(
        {
          success: false,
          error:
            "メール送信が設定されていません (RESEND_API_KEY が未設定)",
        },
        { status: 500 },
      );
    }

    const ticketUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "https://localhost:3000"}/${exhibition.slug}/ticket/${registration.ticket_code}`;

    const fromEmail =
      process.env.EMAIL_FROM || "noreply@exhibition.example.com";
    const fromName = exhibition.name;

    // Resend API でメール送信
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [visitor.email],
        subject: `【${exhibition.name}】事前登録完了のお知らせ`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Arial,sans-serif;background:#f5f5f5;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:${branding.primary_color};color:#fff;padding:32px;text-align:center;border-radius:12px 12px 0 0;">
      <h1 style="margin:0;font-size:24px;">${exhibition.name}</h1>
      <p style="margin:8px 0 0;opacity:0.9;">${exhibition.start_date} 〜 ${exhibition.end_date}</p>
      ${exhibition.venue_name ? `<p style="margin:4px 0 0;opacity:0.8;font-size:14px;">${exhibition.venue_name}</p>` : ""}
    </div>

    <div style="background:#fff;padding:32px;border-radius:0 0 12px 12px;">
      <p style="margin:0 0 16px;font-size:16px;">
        ${visitor.last_name} ${visitor.first_name} 様
      </p>
      <p style="margin:0 0 24px;line-height:1.8;">
        この度は「${exhibition.name}」への事前登録をいただき、誠にありがとうございます。<br>
        以下のチケットコードとQRコードで当日受付をお済ませください。
      </p>

      <div style="background:#f8f9fa;border-radius:8px;padding:24px;text-align:center;margin:0 0 24px;">
        <p style="margin:0 0 8px;color:#888;font-size:14px;">チケットコード</p>
        <p style="margin:0;font-size:32px;font-family:monospace;font-weight:bold;letter-spacing:4px;">
          ${registration.ticket_code}
        </p>
      </div>

      <div style="text-align:center;margin:0 0 24px;">
        <a href="${ticketUrl}" style="display:inline-block;background:${branding.primary_color};color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">
          QRチケットを表示
        </a>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr>
          <td style="padding:8px 0;color:#888;width:120px;">氏名</td>
          <td style="padding:8px 0;">${visitor.last_name} ${visitor.first_name}</td>
        </tr>
        ${visitor.company_name ? `<tr><td style="padding:8px 0;color:#888;">会社名</td><td style="padding:8px 0;">${visitor.company_name}</td></tr>` : ""}
        <tr>
          <td style="padding:8px 0;color:#888;">メール</td>
          <td style="padding:8px 0;">${visitor.email}</td>
        </tr>
      </table>

      <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">

      <p style="margin:0;font-size:12px;color:#999;text-align:center;">
        当日はこのメールまたはQRチケット画面を受付でご提示ください。<br>
        ${branding.copyright || ""}
      </p>
    </div>
  </div>
</body>
</html>
        `.trim(),
      }),
    });

    if (!emailRes.ok) {
      const errorBody = await emailRes.text();
      console.error("Resend API error:", errorBody);
      return NextResponse.json(
        { success: false, error: "メールの送信に失敗しました" },
        { status: 500 },
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
