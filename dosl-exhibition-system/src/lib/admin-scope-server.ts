import type { AdminSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function getAuthorizedExhibitionIds(
  session: AdminSession,
): Promise<string[]> {
  if (session.role === "staff" && !session.exhibition_ids?.length) return [];

  let query = supabaseAdmin
    .from("exhibitions")
    .select("id")
    .eq("organization_id", session.organization_id);

  if (session.role === "staff") {
    query = query.in("id", session.exhibition_ids!);
  }

  const { data, error } = await query;
  if (error) throw new Error(`展示会スコープの取得に失敗しました: ${error.message}`);
  return (data || []).map((exhibition) => exhibition.id);
}
