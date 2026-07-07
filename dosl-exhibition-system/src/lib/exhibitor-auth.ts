import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isValidAccessCode } from "@/lib/validation";

// 出展社認証（リードリトリーバル・GATEオプション）
// Supabase Auth は使わず、出展社ごとのアクセスコードを httpOnly Cookie に
// 保持して毎リクエストDBで照合する（失効・無効化は is_active で即時反映）。

const COOKIE_NAME = "exhibitor-access-code";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 14; // 14日（展示会の会期をカバー）

export interface ExhibitorSession {
  exhibitor_id: string;
  name: string;
  booth_number: string | null;
  exhibition_id: string;
  exhibition_name: string;
  exhibition_slug: string;
}

interface ExhibitorRow {
  id: string;
  name: string;
  booth_number: string | null;
  exhibition: {
    id: string;
    name: string;
    slug: string;
    features: { lead_retrieval?: boolean } | null;
  } | null;
}

/**
 * Cookieのアクセスコードから出展社セッションを取得する。
 * 無効コード・無効化済み・展示会のオプションOFFの場合は null。
 */
export async function getExhibitorSession(): Promise<ExhibitorSession | null> {
  const code = cookies().get(COOKIE_NAME)?.value;
  if (!code || !isValidAccessCode(code)) return null;

  const { data } = await supabaseAdmin
    .from("exhibitors")
    .select(
      "id, name, booth_number, exhibition:exhibitions(id, name, slug, features)",
    )
    .eq("access_code", code)
    .eq("is_active", true)
    .maybeSingle();

  const exhibitor = data as unknown as ExhibitorRow | null;
  if (!exhibitor || !exhibitor.exhibition) return null;
  // 展示会ごとのオプションON/OFF: OFFになったらログイン済みでも遮断
  if (!exhibitor.exhibition.features?.lead_retrieval) return null;

  return {
    exhibitor_id: exhibitor.id,
    name: exhibitor.name,
    booth_number: exhibitor.booth_number,
    exhibition_id: exhibitor.exhibition.id,
    exhibition_name: exhibitor.exhibition.name,
    exhibition_slug: exhibitor.exhibition.slug,
  };
}

/** サーバーコンポーネント用。未ログインはログインページへ */
export async function requireExhibitor(): Promise<ExhibitorSession> {
  const session = await getExhibitorSession();
  if (!session) {
    redirect("/exhibitor/login");
  }
  return session;
}

/** API Route 用。未ログインは401 */
export async function requireExhibitorApi(): Promise<
  ExhibitorSession | NextResponse
> {
  const session = await getExhibitorSession();
  if (!session) {
    return NextResponse.json(
      { success: false, error: "認証が必要です" },
      { status: 401 },
    );
  }
  return session;
}

export function setExhibitorCookie(code: string) {
  cookies().set(COOKIE_NAME, code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
}

export function clearExhibitorCookie() {
  cookies().delete(COOKIE_NAME);
}
