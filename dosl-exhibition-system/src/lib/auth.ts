import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import type { AdminRole } from "@/lib/admin-scope";

export interface AdminSession {
  user_id: string;
  admin_id: string;
  display_name: string;
  role: AdminRole;
  organization_id: string;
  exhibition_ids: string[] | null;
}

/**
 * Cookieのアクセストークンから管理者セッションを取得する。
 * 未ログイン・権限なしの場合は null。
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("sb-access-token")?.value;

  if (!accessToken) {
    return null;
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    return null;
  }

  // admin_users を確認
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: adminUser } = await supabaseAdmin
    .from("admin_users")
    .select("id, role, organization_id, display_name, exhibition_ids")
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .single();

  if (!adminUser) {
    return null;
  }

  return {
    user_id: user.id,
    admin_id: adminUser.id,
    display_name: adminUser.display_name,
    role: adminUser.role as AdminRole,
    organization_id: adminUser.organization_id,
    exhibition_ids: adminUser.exhibition_ids,
  };
}

/**
 * サーバーコンポーネントで管理者セッションを取得する。
 * 未ログインの場合はログインページにリダイレクト。
 */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }
  return session;
}

/**
 * API Route で管理者セッションを検証する。
 * 未ログイン・権限なしの場合は 401 レスポンスを返す。
 *
 * 使い方:
 *   const auth = await requireAdminApi();
 *   if (auth instanceof NextResponse) return auth;
 *   // auth は AdminSession
 */
export async function requireAdminApi(): Promise<AdminSession | NextResponse> {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json(
      { success: false, error: "認証が必要です" },
      { status: 401 },
    );
  }
  return session;
}
