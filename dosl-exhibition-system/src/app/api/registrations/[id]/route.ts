import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth";
import {
  cleanText,
  MAX_LEN,
  REGISTRATION_STATUSES,
  validateCompanions,
  validateVisitorFields,
} from "@/lib/validation";
import { getAuthorizedExhibitionIds } from "@/lib/admin-scope-server";
import { canManageAdminData } from "@/lib/admin-scope";
import { sendConfirmationEmail } from "@/lib/email";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// 登録情報の取得
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const auth = await requireAdminApi();
  if (auth instanceof NextResponse) return auth;
  const allowedIds = await getAuthorizedExhibitionIds(auth);

  const { data, error } = await supabaseAdmin
    .from("registrations")
    .select(
      `
      *,
      visitor:visitors(*),
      exhibition:exhibitions(id, name, slug),
      registration_type:registration_types(id, name, slug, color)
    `,
    )
    .eq("id", id)
    .in("exhibition_id", allowedIds)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "登録情報が見つかりません" },
      { status: 404 },
    );
  }

  return NextResponse.json({ registration: data });
}

// 登録情報の更新
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await requireAdminApi();
    if (auth instanceof NextResponse) return auth;
    if (!canManageAdminData(auth)) {
      return NextResponse.json({ error: "この操作を行う権限がありません" }, { status: 403 });
    }
    const allowedIds = await getAuthorizedExhibitionIds(auth);

    const body = await request.json();

    // 既存の登録情報を取得
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("registrations")
      .select("*, visitor:visitors(*)")
      .eq("id", id)
      .in("exhibition_id", allowedIds)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "登録情報が見つかりません" },
        { status: 404 },
      );
    }

    // --- 登録テーブルの更新値を検証 ---
    const regUpdates: Record<string, unknown> = {};

    if (body.status !== undefined) {
      if (!(REGISTRATION_STATUSES as readonly string[]).includes(body.status)) {
        return NextResponse.json(
          { error: "ステータスの値が不正です" },
          { status: 400 },
        );
      }
      regUpdates.status = body.status;
    }

    if (body.industry !== undefined) {
      const v = cleanText(body.industry);
      if (v !== null && v.length > MAX_LEN.industry) {
        return NextResponse.json(
          { error: `業種は${MAX_LEN.industry}文字以内で入力してください` },
          { status: 400 },
        );
      }
      regUpdates.industry = v;
    }

    if (body.visit_purpose !== undefined) {
      if (body.visit_purpose === null) {
        regUpdates.visit_purpose = null;
      } else if (Array.isArray(body.visit_purpose)) {
        const purposes = body.visit_purpose
          .map((p: unknown) => cleanText(p))
          .filter(Boolean) as string[];
        if (purposes.some((p) => p.length > 50)) {
          return NextResponse.json(
            { error: "来場目的の値が不正です" },
            { status: 400 },
          );
        }
        regUpdates.visit_purpose = purposes.length > 0 ? purposes : null;
      } else {
        return NextResponse.json(
          { error: "来場目的の形式が不正です" },
          { status: 400 },
        );
      }
    }

    if (body.companions !== undefined) {
      const result = validateCompanions(body.companions, 10);
      if (result.errors.length > 0) {
        return NextResponse.json(
          { error: result.errors[0].message },
          { status: 400 },
        );
      }
      regUpdates.companions = result.companions;
    }

    // --- 来場者テーブルの更新値を検証 ---
    const { values: visitorUpdates, errors: visitorErrors } =
      validateVisitorFields({
        last_name: body.last_name,
        first_name: body.first_name,
        last_name_kana: body.last_name_kana,
        first_name_kana: body.first_name_kana,
        company_name: body.company_name,
        company_kana: body.company_kana,
        department: body.department,
        position: body.position,
        phone: body.phone,
        postal_code: body.postal_code,
        address: body.address,
      });
    if (visitorErrors.length > 0) {
      return NextResponse.json(
        { error: visitorErrors[0].message },
        { status: 400 },
      );
    }
    // 姓・名は空にできない
    if (body.last_name !== undefined && !visitorUpdates.last_name) {
      return NextResponse.json({ error: "姓を入力してください" }, { status: 400 });
    }
    if (body.first_name !== undefined && !visitorUpdates.first_name) {
      return NextResponse.json({ error: "名を入力してください" }, { status: 400 });
    }

    // --- 変更のないフィールドは除外する ---
    // registrations は UPDATE のたびにトリガーで updated_at が進み、
    // 送付済みチケットURLの署名（updated_at をバインド）が失効するため、
    // 実際に値が変わるときだけ UPDATE を発行する。
    const isSameValue = (a: unknown, b: unknown) =>
      JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    for (const key of Object.keys(regUpdates)) {
      if (isSameValue(regUpdates[key], (existing as Record<string, unknown>)[key])) {
        delete regUpdates[key];
      }
    }
    const existingVisitor = (existing.visitor ?? {}) as Record<string, unknown>;
    for (const key of Object.keys(visitorUpdates)) {
      if (isSameValue(visitorUpdates[key], existingVisitor[key])) {
        delete visitorUpdates[key];
      }
    }

    // --- 更新実行 ---
    if (Object.keys(regUpdates).length > 0) {
      const { error: regError } = await supabaseAdmin
        .from("registrations")
        .update(regUpdates)
        .eq("id", id);

      if (regError) {
        console.error("Registration update error:", regError);
        return NextResponse.json(
          { error: "登録情報の更新に失敗しました" },
          { status: 500 },
        );
      }
    }

    if (Object.keys(visitorUpdates).length > 0) {
      const { error: visitorError } = await supabaseAdmin
        .from("visitors")
        .update(visitorUpdates)
        .eq("id", existing.visitor_id);

      if (visitorError) {
        console.error("Visitor update error:", visitorError);
        return NextResponse.json(
          { error: "来場者情報の更新に失敗しました" },
          { status: 500 },
        );
      }
    }

    // 登録行が実際に変わった場合、送付済みチケットURLは署名失効している。
    // キャンセル以外は新しい署名URLで確認メールを自動再送する。
    let emailResent = false;
    let emailError: string | null = null;
    const registrationChanged = Object.keys(regUpdates).length > 0;
    if (registrationChanged && regUpdates.status !== "cancelled") {
      const emailResult = await sendConfirmationEmail(id);
      if (emailResult.success) {
        emailResent = true;
      } else {
        emailError = emailResult.error ?? "メールの再送に失敗しました";
        console.error("Ticket auto-resend error:", emailError);
      }
    }

    // 更新後のデータを返す
    const { data: updated } = await supabaseAdmin
      .from("registrations")
      .select(
        `
        *,
        visitor:visitors(*),
        exhibition:exhibitions(id, name, slug),
        registration_type:registration_types(id, name, slug, color)
      `,
      )
      .eq("id", id)
      .in("exhibition_id", allowedIds)
      .single();

    return NextResponse.json({
      success: true,
      registration: updated,
      email_resent: emailResent,
      email_error: emailError,
    });
  } catch (err) {
    console.error("Registration PATCH error:", err);
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
