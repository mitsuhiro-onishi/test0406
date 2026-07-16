import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireExhibitorApi } from "@/lib/exhibitor-auth";
import { isValidUuid, validateLeadNote } from "@/lib/validation";

// リードの商談メモ更新（リードリトリーバル・GATEオプション）

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await requireExhibitorApi();
    if (auth instanceof NextResponse) return auth;

    if (!isValidUuid(id)) {
      return NextResponse.json(
        { success: false, error: "リードが見つかりません" },
        { status: 404 },
      );
    }

    // 自社のリードのみ更新可
    const { data: existing } = await supabaseAdmin
      .from("exhibitor_leads")
      .select("id")
      .eq("id", id)
      .eq("exhibitor_id", auth.exhibitor_id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "リードが見つかりません" },
        { status: 404 },
      );
    }

    const body = await request.json();
    const { value: note, error: noteError } = validateLeadNote(body.note);
    if (noteError) {
      return NextResponse.json(
        { success: false, error: noteError.message },
        { status: 400 },
      );
    }

    const { data: lead, error } = await supabaseAdmin
      .from("exhibitor_leads")
      .update({ note })
      .eq("id", id)
      .select("id, note, scanned_at")
      .single();

    if (error || !lead) {
      console.error("Lead note update error:", error);
      return NextResponse.json(
        { success: false, error: "メモの保存に失敗しました" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, lead });
  } catch (err) {
    console.error("Lead note API error:", err);
    return NextResponse.json(
      { success: false, error: "サーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
