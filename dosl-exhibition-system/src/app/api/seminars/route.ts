import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth";
import {
  isValidUuid,
  validateSeminarFields,
  SEMINAR_STATUSES,
} from "@/lib/validation";

// セミナー管理（GATEオプション）
// 展示会ごとの features.seminar フラグでON/OFFされる。
// フラグOFFの展示会ではセミナーの作成を拒否する。

export interface SeminarStats {
  confirmed_count: number;
  waitlisted_count: number;
  checked_in_count: number;
}

/** 一覧: GET /api/seminars?exhibition_id=&status= */
export async function GET(request: NextRequest) {
  const auth = await requireAdminApi();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const exhibition_id = searchParams.get("exhibition_id");
  const status = searchParams.get("status");

  let query = supabaseAdmin
    .from("seminars")
    .select("*, exhibition:exhibitions(id, name, slug)")
    .order("starts_at", { ascending: true });

  if (exhibition_id) {
    if (!isValidUuid(exhibition_id)) {
      return NextResponse.json(
        { error: "exhibition_id が不正です" },
        { status: 400 },
      );
    }
    query = query.eq("exhibition_id", exhibition_id);
  }
  if (status && (SEMINAR_STATUSES as readonly string[]).includes(status)) {
    query = query.eq("status", status);
  }

  const { data: seminars, error } = await query;
  if (error) {
    console.error("Seminars query error:", error);
    return NextResponse.json(
      { error: "データの取得に失敗しました" },
      { status: 500 },
    );
  }

  // 予約・チェックイン集計をビューから引いてマージ
  const ids = (seminars || []).map((s) => s.id);
  const statsById = new Map<string, SeminarStats>();
  if (ids.length > 0) {
    const { data: stats } = await supabaseAdmin
      .from("v_seminar_stats")
      .select("seminar_id, confirmed_count, waitlisted_count, checked_in_count")
      .in("seminar_id", ids);
    for (const s of stats || []) {
      statsById.set(s.seminar_id, {
        confirmed_count: Number(s.confirmed_count) || 0,
        waitlisted_count: Number(s.waitlisted_count) || 0,
        checked_in_count: Number(s.checked_in_count) || 0,
      });
    }
  }

  return NextResponse.json({
    seminars: (seminars || []).map((s) => ({
      ...s,
      stats: statsById.get(s.id) || {
        confirmed_count: 0,
        waitlisted_count: 0,
        checked_in_count: 0,
      },
    })),
  });
}

/** 作成: POST /api/seminars */
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
    if (!exhibition.features?.seminar) {
      return NextResponse.json(
        {
          success: false,
          error: "この展示会ではセミナーオプションが有効になっていません",
        },
        { status: 400 },
      );
    }

    const { values, errors } = validateSeminarFields(body, { partial: false });
    if (errors.length > 0) {
      return NextResponse.json(
        { success: false, error: errors[0].message, field_errors: errors },
        { status: 400 },
      );
    }

    const { data: seminar, error } = await supabaseAdmin
      .from("seminars")
      .insert({ exhibition_id: exhibition.id, ...values })
      .select()
      .single();

    if (error || !seminar) {
      console.error("Seminar insert error:", error);
      return NextResponse.json(
        { success: false, error: "セミナーの作成に失敗しました" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, seminar });
  } catch (err) {
    console.error("Seminar create API error:", err);
    return NextResponse.json(
      { success: false, error: "サーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
