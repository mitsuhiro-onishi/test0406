import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "メールアドレスとパスワードを入力してください" },
        { status: 400 },
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
      .select("id, role, organization_id, display_name")
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
    const cookieStore = cookies();
    cookieStore.set("sb-access-token", data.session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24, // 24時間
      path: "/",
    });
    cookieStore.set("sb-refresh-token", data.session.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
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
