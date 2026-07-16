import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth";
import { isValidUuid, validateSeminarFields } from "@/lib/validation";
import { getAuthorizedExhibitionIds } from "@/lib/admin-scope-server";
import { canManageAdminData } from "@/lib/admin-scope";

// セミナー詳細・更新（GATEオプション）

/** 詳細: GET /api/seminars/[id] */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireAdminApi();
  if (auth instanceof NextResponse) return auth;
  const allowedIds = await getAuthorizedExhibitionIds(auth);

  if (!isValidUuid(params.id)) {
    return NextResponse.json(
      { error: "セミナーが見つかりません" },
      { status: 404 },
    );
  }

  const { data: seminar } = await supabaseAdmin
    .from("seminars")
    .select("*, exhibition:exhibitions(id, name, slug)")
    .eq("id", params.id)
    .in("exhibition_id", allowedIds)
    .maybeSingle();

  if (!seminar) {
    return NextResponse.json(
      { error: "セミナーが見つかりません" },
      { status: 404 },
    );
  }

  const { data: stats } = await supabaseAdmin
    .from("v_seminar_stats")
    .select("confirmed_count, waitlisted_count, checked_in_count")
    .eq("seminar_id", params.id)
    .maybeSingle();

  return NextResponse.json({
    seminar: {
      ...seminar,
      stats: {
        confirmed_count: Number(stats?.confirmed_count) || 0,
        waitlisted_count: Number(stats?.waitlisted_count) || 0,
        checked_in_count: Number(stats?.checked_in_count) || 0,
      },
    },
  });
}

/** 更新: PATCH /api/seminars/[id] */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await requireAdminApi();
    if (auth instanceof NextResponse) return auth;
    if (!canManageAdminData(auth)) {
      return NextResponse.json({ success: false, error: "この操作を行う権限がありません" }, { status: 403 });
    }
    const allowedIds = await getAuthorizedExhibitionIds(auth);

    if (!isValidUuid(params.id)) {
      return NextResponse.json(
        { success: false, error: "セミナーが見つかりません" },
        { status: 404 },
      );
    }

    const { data: existing } = await supabaseAdmin
      .from("seminars")
      .select("*")
      .eq("id", params.id)
      .in("exhibition_id", allowedIds)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "セミナーが見つかりません" },
        { status: 404 },
      );
    }

    const body = await request.json();

    // 開始・終了の前後関係は既存値とマージした上で検証する
    const input = { ...body };
    if (input.starts_at !== undefined || input.ends_at !== undefined) {
      if (input.starts_at === undefined) input.starts_at = existing.starts_at;
      if (input.ends_at === undefined) input.ends_at = existing.ends_at;
    }

    const { values, errors } = validateSeminarFields(input, { partial: true });
    if (errors.length > 0) {
      return NextResponse.json(
        { success: false, error: errors[0].message, field_errors: errors },
        { status: 400 },
      );
    }
    if (Object.keys(values).length === 0) {
      return NextResponse.json(
        { success: false, error: "更新する項目がありません" },
        { status: 400 },
      );
    }

    const { data: seminar, error } = await supabaseAdmin
      .from("seminars")
      .update(values)
      .eq("id", params.id)
      .select()
      .single();

    if (error || !seminar) {
      console.error("Seminar update error:", error);
      return NextResponse.json(
        { success: false, error: "セミナーの更新に失敗しました" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, seminar });
  } catch (err) {
    console.error("Seminar update API error:", err);
    return NextResponse.json(
      { success: false, error: "サーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
