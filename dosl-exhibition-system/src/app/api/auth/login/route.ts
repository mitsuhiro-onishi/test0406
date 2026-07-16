import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { cleanText, isValidEmail, MAX_LEN } from "@/lib/validation";

export async function POST(request: NextRequest) {
  try {
    // レート制限: ブルートフォース対策（IPごと 10回/15分）
    const ip = getClientIp(request);
    const rl = rateLimit(`login:${ip}`, 10, 15 * 60_000);
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
    const email = cleanText(body.email)?.toLowerCase() ?? null;
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "メールアドレスとパスワードを入力してください" },
        { status: 400 },
      );
    }
    if (!isValidEmail(email) || password.length > MAX_LEN.password) {
      return NextResponse.json(
        { success: false, error: "メールアドレスまたはパスワードが正しくありません" },
        { status: 401 },
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    // Supabase Auth でログイン
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      return NextResponse.json(
        { success: false, error: "メールアドレスまたはパスワードが正しくありません" },
        { status: 401 },
      );
    }

    // admin_users テーブルに存在するか確認
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: adminUser } = await supabaseAdmin
      .from("admin_users")
      .select("id, role, organization_id, display_name, exhibition_ids")
      .eq("auth_user_id", data.user.id)
      .eq("is_active", true)
      .single();

    if (!adminUser) {
      return NextResponse.json(
        { success: false, error: "管理者権限がありません" },
        { status: 403 },
      );
    }

    // セッション情報をcookieに保存
    // アクセストークンはJWTの有効期限に合わせ、失効前はproxyがリフレッシュする
    const cookieStore = await cookies();
    const secure = process.env.NODE_ENV === "production";
    cookieStore.set("sb-access-token", data.session.access_token, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      maxAge: data.session.expires_in || 60 * 60,
      path: "/",
    });
    cookieStore.set("sb-refresh-token", data.session.refresh_token, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7日間
      path: "/",
    });

    return NextResponse.json({
      success: true,
      user: {
        id: adminUser.id,
        display_name: adminUser.display_name,
        role: adminUser.role,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json(
      { success: false, error: "サーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
