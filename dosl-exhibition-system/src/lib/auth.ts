import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

export interface AdminSession {
  user_id: string;
  admin_id: string;
  display_name: string;
  role: string;
  organization_id: string;
}

/**
 * サーバーコンポーネントで管理者セッションを取得する。
 * 未ログインの場合はログインページにリダイレクト。
 */
export async function requireAdmin(): Promise<AdminSession> {
  const cookieStore = cookies();
  const accessToken = cookieStore.get("sb-access-token")?.value;

  if (!accessToken) {
    redirect("/admin/login");
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
    redirect("/admin/login");
  }

  // admin_users を確認
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: adminUser } = await supabaseAdmin
    .from("admin_users")
    .select("id, role, organization_id, display_name")
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .single();

  if (!adminUser) {
    redirect("/admin/login");
  }

  return {
    user_id: user.id,
    admin_id: adminUser.id,
    display_name: adminUser.display_name,
    role: adminUser.role,
    organization_id: adminUser.organization_id,
  };
}
