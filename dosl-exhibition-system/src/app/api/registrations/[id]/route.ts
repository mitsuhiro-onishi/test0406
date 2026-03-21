import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

interface RouteParams {
  params: { id: string };
}

// 登録情報の取得
export async function GET(_request: NextRequest, { params }: RouteParams) {
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
    .eq("id", params.id)
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
    const body = await request.json();
    const {
      status,
      industry,
      visit_purpose,
      companions,
      // visitor fields
      last_name,
      first_name,
      last_name_kana,
      first_name_kana,
      company_name,
      company_kana,
      department,
      position,
      phone,
      postal_code,
      address,
    } = body;

    // 既存の登録情報を取得
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("registrations")
      .select("*, visitor:visitors(*)")
      .eq("id", params.id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "登録情報が見つかりません" },
        { status: 404 },
      );
    }

    // 登録テーブルの更新
    const regUpdates: Record<string, unknown> = {};
    if (status !== undefined) regUpdates.status = status;
    if (industry !== undefined) regUpdates.industry = industry;
    if (visit_purpose !== undefined) regUpdates.visit_purpose = visit_purpose;
    if (companions !== undefined) regUpdates.companions = companions;

    if (Object.keys(regUpdates).length > 0) {
      const { error: regError } = await supabaseAdmin
        .from("registrations")
        .update(regUpdates)
        .eq("id", params.id);

      if (regError) {
        console.error("Registration update error:", regError);
        return NextResponse.json(
          { error: "登録情報の更新に失敗しました" },
          { status: 500 },
        );
      }
    }

    // 来場者テーブルの更新
    const visitorUpdates: Record<string, unknown> = {};
    if (last_name !== undefined) visitorUpdates.last_name = last_name;
    if (first_name !== undefined) visitorUpdates.first_name = first_name;
    if (last_name_kana !== undefined)
      visitorUpdates.last_name_kana = last_name_kana;
    if (first_name_kana !== undefined)
      visitorUpdates.first_name_kana = first_name_kana;
    if (company_name !== undefined) visitorUpdates.company_name = company_name;
    if (company_kana !== undefined) visitorUpdates.company_kana = company_kana;
    if (department !== undefined) visitorUpdates.department = department;
    if (position !== undefined) visitorUpdates.position = position;
    if (phone !== undefined) visitorUpdates.phone = phone;
    if (postal_code !== undefined) visitorUpdates.postal_code = postal_code;
    if (address !== undefined) visitorUpdates.address = address;

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
      .eq("id", params.id)
      .single();

    return NextResponse.json({ success: true, registration: updated });
  } catch (err) {
    console.error("Registration PATCH error:", err);
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
