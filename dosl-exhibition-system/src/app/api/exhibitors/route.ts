import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth";
import { isValidUuid, validateExhibitorFields } from "@/lib/validation";
import { generateAccessCode } from "@/lib/access-code";

// 出展社管理（リードリトリーバル・GATEオプション）
// 展示会ごとの features.lead_retrieval フラグでON/OFFされる。

/** 一覧: GET /api/exhibitors?exhibition_id= */
export async function GET(request: NextRequest) {
  const auth = await requireAdminApi();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const exhibition_id = searchParams.get("exhibition_id");

  let query = supabaseAdmin
    .from("exhibitors")
    .select("*, exhibition:exhibitions(id, name, slug)")
    .order("created_at", { ascending: true });

  if (exhibition_id) {
    if (!isValidUuid(exhibition_id)) {
      return NextResponse.json(
        { error: "exhibition_id が不正です" },
        { status: 400 },
      );
    }
    query = query.eq("exhibition_id", exhibition_id);
  }

  const { data: exhibitors, error } = await query;
  if (error) {
    console.error("Exhibitors query error:", error);
    return NextResponse.json(
      { error: "データの取得に失敗しました" },
      { status: 500 },
    );
  }

  // 出展社ごとのリード数を集計
  const ids = (exhibitors || []).map((e) => e.id);
  const countById = new Map<string, number>();
  if (ids.length > 0) {
    const { data: leads } = await supabaseAdmin
      .from("exhibitor_leads")
      .select("exhibitor_id")
      .in("exhibitor_id", ids);
    for (const l of leads || []) {
      countById.set(l.exhibitor_id, (countById.get(l.exhibitor_id) || 0) + 1);
    }
  }

  return NextResponse.json({
    exhibitors: (exhibitors || []).map((e) => ({
      ...e,
      lead_count: countById.get(e.id) || 0,
    })),
  });
}

/** 作成: POST /api/exhibitors */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminApi();
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();

    if (!isValidUuid(body.exhibition_id)) {
      return NextResponse.json(
        { success: false, error: "展示会を指定してください" },
        { status: 400 },
      );
    }

    const { data: exhibition } = await supabaseAdmin
      .from("exhibitions")
      .select("id, name, features")
      .eq("id", body.exhibition_id)
      .maybeSingle();

    if (!exhibition) {
      return NextResponse.json(
        { success: false, error: "展示会が見つかりません" },
        { status: 404 },
      );
    }
    if (!exhibition.features?.lead_retrieval) {
      return NextResponse.json(
        {
          success: false,
          error: "この展示会ではリードオプションが有効になっていません",
        },
        { status: 400 },
      );
    }

    const { values, errors } = validateExhibitorFields(body, {
      partial: false,
    });
    if (errors.length > 0) {
      return NextResponse.json(
        { success: false, error: errors[0].message, field_errors: errors },
        { status: 400 },
      );
    }

    // アクセスコード生成（衝突時はリトライ）
    for (let attempt = 0; attempt < 5; attempt++) {
      const access_code = generateAccessCode();
      const { data: exhibitor, error } = await supabaseAdmin
        .from("exhibitors")
        .insert({
          exhibition_id: exhibition.id,
          access_code,
          ...values,
        })
        .select()
        .single();

      if (!error && exhibitor) {
        return NextResponse.json({ success: true, exhibitor });
      }
      if (error?.code !== "23505") {
        console.error("Exhibitor insert error:", error);
        break;
      }
    }

    return NextResponse.json(
      { success: false, error: "出展社の作成に失敗しました" },
      { status: 500 },
    );
  } catch (err) {
    console.error("Exhibitor create API error:", err);
    return NextResponse.json(
      { success: false, error: "サーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
