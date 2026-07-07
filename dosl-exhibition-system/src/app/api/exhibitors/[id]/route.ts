import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth";
import { isValidUuid, validateExhibitorFields } from "@/lib/validation";
import { generateAccessCode } from "@/lib/access-code";

// 出展社の更新（リードリトリーバル・GATEオプション）
// body.regenerate_access_code=true でアクセスコードを再発行する

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await requireAdminApi();
    if (auth instanceof NextResponse) return auth;

    if (!isValidUuid(params.id)) {
      return NextResponse.json(
        { success: false, error: "出展社が見つかりません" },
        { status: 404 },
      );
    }

    const { data: existing } = await supabaseAdmin
      .from("exhibitors")
      .select("id")
      .eq("id", params.id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "出展社が見つかりません" },
        { status: 404 },
      );
    }

    const body = await request.json();
    const { values, errors } = validateExhibitorFields(body, {
      partial: true,
    });
    if (errors.length > 0) {
      return NextResponse.json(
        { success: false, error: errors[0].message, field_errors: errors },
        { status: 400 },
      );
    }

    const regenerate = body.regenerate_access_code === true;
    if (Object.keys(values).length === 0 && !regenerate) {
      return NextResponse.json(
        { success: false, error: "更新する項目がありません" },
        { status: 400 },
      );
    }

    // アクセスコード再発行（衝突時はリトライ）
    for (let attempt = 0; attempt < 5; attempt++) {
      const update: Record<string, unknown> = { ...values };
      if (regenerate) update.access_code = generateAccessCode();

      const { data: exhibitor, error } = await supabaseAdmin
        .from("exhibitors")
        .update(update)
        .eq("id", params.id)
        .select()
        .single();

      if (!error && exhibitor) {
        return NextResponse.json({ success: true, exhibitor });
      }
      if (!(regenerate && error?.code === "23505")) {
        console.error("Exhibitor update error:", error);
        break;
      }
    }

    return NextResponse.json(
      { success: false, error: "出展社の更新に失敗しました" },
      { status: 500 },
    );
  } catch (err) {
    console.error("Exhibitor update API error:", err);
    return NextResponse.json(
      { success: false, error: "サーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
