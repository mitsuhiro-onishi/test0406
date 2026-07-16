import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// アクセストークン（既定1時間）の失効前にリフレッシュトークンで更新する。
// これがないと展示会当日の受付オペレーション中にセッションが切れる。

const ACCESS_COOKIE = "sb-access-token";
const REFRESH_COOKIE = "sb-refresh-token";
// 失効までの残りがこの秒数を切ったらリフレッシュする
const REFRESH_MARGIN_SEC = 120;

function jwtExpiresSoon(token: string): boolean {
  try {
    const payloadPart = token.split(".")[1];
    const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64));
    if (typeof payload.exp !== "number") return true;
    return payload.exp - Date.now() / 1000 < REFRESH_MARGIN_SEC;
  } catch {
    return true;
  }
}

export async function proxy(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  // ログイン画面・認証API・そもそも未ログインは素通し
  if (!refreshToken) return NextResponse.next();
  if (accessToken && !jwtExpiresSoon(accessToken)) return NextResponse.next();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: refreshToken,
  });

  if (error || !data.session) {
    // リフレッシュ不能: Cookieを破棄して未ログイン扱いに落とす
    const response = NextResponse.next();
    response.cookies.delete(ACCESS_COOKIE);
    response.cookies.delete(REFRESH_COOKIE);
    return response;
  }

  const secure = process.env.NODE_ENV === "production";
  // 下流のサーバーコンポーネント/API Routeにも新トークンを見せる
  request.cookies.set(ACCESS_COOKIE, data.session.access_token);
  const response = NextResponse.next({ request });
  response.cookies.set(ACCESS_COOKIE, data.session.access_token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: data.session.expires_in,
    path: "/",
  });
  response.cookies.set(REFRESH_COOKIE, data.session.refresh_token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
};
