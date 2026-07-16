import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { setExhibitorCookie } from "@/lib/exhibitor-auth";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { cleanText, isValidAccessCode } from "@/lib/validation";

// 出展社ログイン（リードリトリーバル・GATEオプション）

export async function POST(request: NextRequest) {
  try {
    // レート制限: アクセスコードの総当たり対策（IPごと 10回/15分）
    const ip = getClientIp(request);
    const rl = rateLimit(`exhibitor-login:${ip}`, 10, 15 * 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "ログイン試行が多すぎます。しばらくしてからお試しください",
        },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }

    const body = await request.json();
    const code = cleanText(body.access_code)?.toUpperCase() ?? null;

    if (!code) {
      return NextResponse.json(
        { success: false, error: "アクセスコードを入力してください" },
        { status: 400 },
      );
    }
    if (!isValidAccessCode(code)) {
      return NextResponse.json(
        { success: false, error: "アクセスコードが正しくありません" },
        { status: 401 },
      );
    }

    const { data } = await supabaseAdmin
      .from("exhibitors")
      .select(
        "id, name, booth_number, exhibition:exhibitions(id, name, features)",
      )
      .eq("access_code", code)
      .eq("is_active", true)
      .maybeSingle();

    const exhibition = data?.exhibition as unknown as {
      id: string;
      name: string;
      features: { lead_retrieval?: boolean } | null;
    } | null;

    if (!data || !exhibition) {
      return NextResponse.json(
        { success: false, error: "アクセスコードが正しくありません" },
        { status: 401 },
      );
    }
    if (!exhibition.features?.lead_retrieval) {
      return NextResponse.json(
        {
          success: false,
          error: "この展示会ではリード機能が有効になっていません",
        },
        { status: 403 },
      );
    }

    await setExhibitorCookie(code);

    return NextResponse.json({
      success: true,
      exhibitor: {
        name: data.name,
        booth_number: data.booth_number,
        exhibition_name: exhibition.name,
      },
    });
  } catch (err) {
    console.error("Exhibitor login error:", err);
    return NextResponse.json(
      { success: false, error: "サーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
