import { supabaseAdmin } from "@/lib/supabase/server";
import { generateQRCodeDataURL } from "@/lib/qr";
import { isValidTicketCode } from "@/lib/validation";
import {
  getTicketLinkSecret,
  isTicketLinkSignature,
  verifyTicketLinkSignature,
} from "@/lib/ticket-link";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string; code: string }>;
  searchParams: Promise<{
    expires?: string | string[];
    signature?: string | string[];
  }>;
}

function InvalidTicketLink() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          チケットを表示できません
        </h1>
        <p className="text-gray-500">
          リンクが無効または期限切れです。確認メールを再送してください
        </p>
      </div>
    </div>
  );
}

export default async function TicketPage({ params, searchParams }: Props) {
  const [{ slug, code }, query] = await Promise.all([params, searchParams]);
  const expiresValue = Array.isArray(query.expires)
    ? undefined
    : query.expires;
  const signature = Array.isArray(query.signature)
    ? undefined
    : query.signature;
  const expires = Number(expiresValue);
  const secret = getTicketLinkSecret();

  // 明らかに不正・期限切れのリクエストはDB照会前に拒否する。
  if (
    !secret ||
    !isValidTicketCode(code) ||
    !Number.isSafeInteger(expires) ||
    expires <= Math.floor(Date.now() / 1000) ||
    !isTicketLinkSignature(signature)
  ) {
    return <InvalidTicketLink />;
  }

  // ticket_code と URL の展示会slugが両方一致する登録だけを取得する。
  // ticket_code が他展示会のものでも来場者情報を表示しない。
  const { data: registration } = await supabaseAdmin
    .from("registrations")
    .select(
      `
      *,
      visitor:visitors(*),
      exhibition:exhibitions!inner(*),
      registration_type:registration_types(*)
    `,
    )
    .eq("ticket_code", code)
    .eq("exhibition.slug", slug)
    .maybeSingle();

  if (
    !registration ||
    !verifyTicketLinkSignature(
      {
        slug,
        code,
        expires,
        registrationUpdatedAt: registration.updated_at,
      },
      signature,
      secret,
    )
  ) {
    return <InvalidTicketLink />;
  }

  const exhibition = registration.exhibition;
  const visitor = registration.visitor;
  const branding = exhibition.branding;
  const qrDataUrl = await generateQRCodeDataURL(registration.ticket_code);

  return (
    <div
      className="min-h-screen py-8 px-4"
      style={{
        background: `linear-gradient(135deg, ${branding.primary_color}10, ${branding.secondary_color}10)`,
      }}
    >
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-lg overflow-hidden">
        {/* ヘッダー */}
        <div
          className="p-6 text-white text-center"
          style={{ backgroundColor: branding.primary_color }}
        >
          <h1 className="text-xl font-bold">{exhibition.name}</h1>
          <p className="opacity-90 text-sm mt-1">
            {exhibition.start_date} 〜 {exhibition.end_date}
          </p>
          {exhibition.venue_name && (
            <p className="opacity-80 text-sm">{exhibition.venue_name}</p>
          )}
        </div>

        {/* QRコード */}
        <div className="p-8 text-center">
          <img
            src={qrDataUrl}
            alt="QR Code"
            className="mx-auto mb-4"
            width={250}
            height={250}
          />
          <p className="text-2xl font-mono font-bold tracking-wider mb-6">
            {registration.ticket_code}
          </p>

          {/* 来場者情報 */}
          <div className="text-left border-t pt-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-500 text-sm">氏名</span>
              <span className="font-medium">
                {visitor.last_name} {visitor.first_name}
              </span>
            </div>
            {visitor.company_name && (
              <div className="flex justify-between">
                <span className="text-gray-500 text-sm">会社名</span>
                <span className="font-medium">{visitor.company_name}</span>
              </div>
            )}
            {registration.registration_type && (
              <div className="flex justify-between">
                <span className="text-gray-500 text-sm">種別</span>
                <span
                  className="font-medium px-2 py-0.5 rounded text-sm text-white"
                  style={{
                    backgroundColor: registration.registration_type.color,
                  }}
                >
                  {registration.registration_type.name}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500 text-sm">ステータス</span>
              <span className="font-medium text-green-600">
                {registration.status === "confirmed" ? "登録済" : registration.status}
              </span>
            </div>
          </div>
        </div>

        {/* フッター */}
        <div className="bg-gray-50 px-6 py-4 text-center text-xs text-gray-400">
          <p>当日はこのQRコードを受付でご提示ください</p>
          {branding.copyright && <p className="mt-1">{branding.copyright}</p>}
        </div>
      </div>
    </div>
  );
}
