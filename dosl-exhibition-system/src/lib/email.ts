import { supabaseAdmin } from "@/lib/supabase/server";
import { escapeHtml, safeCssColor } from "@/lib/validation";

export interface SendEmailResult {
  success: boolean;
  error?: string;
  status?: number;
}

/**
 * 登録確認メールを送信する。
 * 登録API（自動送信）と管理画面の通知ボタン（手動送信）の両方から使う。
 */
export async function sendConfirmationEmail(
  registrationId: string,
): Promise<SendEmailResult> {
  const { data: registration, error: fetchError } = await supabaseAdmin
    .from("registrations")
    .select(
      `
      *,
      visitor:visitors(*),
      exhibition:exhibitions(*)
    `,
    )
    .eq("id", registrationId)
    .single();

  if (fetchError || !registration) {
    return { success: false, error: "登録情報が見つかりません", status: 404 };
  }

  const visitor = registration.visitor;
  const exhibition = registration.exhibition;
  const branding = exhibition.branding || {};

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    return {
      success: false,
      error: "メール送信が設定されていません (RESEND_API_KEY が未設定)",
      status: 500,
    };
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const ticketUrl = `${baseUrl}/${encodeURIComponent(exhibition.slug)}/ticket/${encodeURIComponent(registration.ticket_code)}`;

  const fromEmail = process.env.EMAIL_FROM || "noreply@exhibition.example.com";
  // メールヘッダーインジェクション防止: 改行・引用符を除去
  const fromName = String(exhibition.name).replace(/[\r\n"<>]/g, "").trim();
  const primaryColor = safeCssColor(branding.primary_color, "#4a90d9");

  const visitorName = `${escapeHtml(visitor.last_name)} ${escapeHtml(visitor.first_name)}`;

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
    <div style="background:${primaryColor};color:#fff;padding:32px;text-align:center;border-radius:12px 12px 0 0;">
      <h1 style="margin:0;font-size:24px;">${escapeHtml(exhibition.name)}</h1>
      <p style="margin:8px 0 0;opacity:0.9;">${escapeHtml(exhibition.start_date)} 〜 ${escapeHtml(exhibition.end_date)}</p>
      ${exhibition.venue_name ? `<p style="margin:4px 0 0;opacity:0.8;font-size:14px;">${escapeHtml(exhibition.venue_name)}</p>` : ""}
    </div>

    <div style="background:#fff;padding:32px;border-radius:0 0 12px 12px;">
      <p style="margin:0 0 16px;font-size:16px;">
        ${visitorName} 様
      </p>
      <p style="margin:0 0 24px;line-height:1.8;">
        この度は「${escapeHtml(exhibition.name)}」への事前登録をいただき、誠にありがとうございます。<br>
        以下のチケットコードとQRコードで当日受付をお済ませください。
      </p>

      <div style="background:#f8f9fa;border-radius:8px;padding:24px;text-align:center;margin:0 0 24px;">
        <p style="margin:0 0 8px;color:#888;font-size:14px;">チケットコード</p>
        <p style="margin:0;font-size:32px;font-family:monospace;font-weight:bold;letter-spacing:4px;">
          ${escapeHtml(registration.ticket_code)}
        </p>
      </div>

      <div style="text-align:center;margin:0 0 24px;">
        <a href="${escapeHtml(ticketUrl)}" style="display:inline-block;background:${primaryColor};color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">
          QRチケットを表示
        </a>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr>
          <td style="padding:8px 0;color:#888;width:120px;">氏名</td>
          <td style="padding:8px 0;">${visitorName}</td>
        </tr>
        ${visitor.company_name ? `<tr><td style="padding:8px 0;color:#888;">会社名</td><td style="padding:8px 0;">${escapeHtml(visitor.company_name)}</td></tr>` : ""}
        <tr>
          <td style="padding:8px 0;color:#888;">メール</td>
          <td style="padding:8px 0;">${escapeHtml(visitor.email)}</td>
        </tr>
      </table>

      <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">

      <p style="margin:0;font-size:12px;color:#999;text-align:center;">
        当日はこのメールまたはQRチケット画面を受付でご提示ください。<br>
        ${escapeHtml(branding.copyright || "")}
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
    return { success: false, error: "メールの送信に失敗しました", status: 500 };
  }

  return { success: true };
}
