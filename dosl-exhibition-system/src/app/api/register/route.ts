import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      slug,
      email,
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
      industry,
      visit_purpose,
      registration_type_slug,
      companions,
      seminar_ids,
    } = body;

    // バリデーション
    if (!slug || !email || !last_name || !first_name) {
      return NextResponse.json(
        { success: false, error: "必須項目が入力されていません" },
        { status: 400 },
      );
    }

    // 展示会を取得
    const { data: exhibition, error: exhError } = await supabaseAdmin
      .from("exhibitions")
      .select("*")
      .eq("slug", slug)
      .eq("status", "published")
      .single();

    if (exhError || !exhibition) {
      return NextResponse.json(
        { success: false, error: "展示会が見つかりません" },
        { status: 404 },
      );
    }

    // 登録上限チェック
    if (exhibition.max_registrations) {
      const { count } = await supabaseAdmin
        .from("registrations")
        .select("*", { count: "exact", head: true })
        .eq("exhibition_id", exhibition.id)
        .eq("status", "confirmed");

      if (count && count >= exhibition.max_registrations) {
        return NextResponse.json(
          { success: false, error: "登録数が上限に達しています" },
          { status: 400 },
        );
      }
    }

    // 来場者の UPSERT (メールで一意)
    const { data: visitor, error: visitorError } = await supabaseAdmin
      .from("visitors")
      .upsert(
        {
          email: email.toLowerCase().trim(),
          last_name,
          first_name,
          last_name_kana: last_name_kana || null,
          first_name_kana: first_name_kana || null,
          company_name: company_name || null,
          company_kana: company_kana || null,
          department: department || null,
          position: position || null,
          phone: phone || null,
          postal_code: postal_code || null,
          address: address || null,
        },
        { onConflict: "email" },
      )
      .select()
      .single();

    if (visitorError || !visitor) {
      console.error("Visitor upsert error:", visitorError);
      return NextResponse.json(
        { success: false, error: "来場者情報の登録に失敗しました" },
        { status: 500 },
      );
    }

    // 登録種別の取得
    let registration_type_id: string | null = null;
    if (registration_type_slug) {
      const { data: regType } = await supabaseAdmin
        .from("registration_types")
        .select("id")
        .eq("exhibition_id", exhibition.id)
        .eq("slug", registration_type_slug)
        .single();
      registration_type_id = regType?.id || null;
    }

    // チケットコード生成 (DB関数を使用)
    const { data: ticketResult } = await supabaseAdmin.rpc(
      "generate_ticket_code",
    );
    const ticket_code = ticketResult as string;

    // 重複チェック
    const { data: existing } = await supabaseAdmin
      .from("registrations")
      .select("id, ticket_code")
      .eq("exhibition_id", exhibition.id)
      .eq("visitor_id", visitor.id)
      .single();

    if (existing) {
      return NextResponse.json({
        success: true,
        ticket_code: existing.ticket_code,
        registration_id: existing.id,
        message: "既に登録済みです",
      });
    }

    // 登録の作成
    const { data: registration, error: regError } = await supabaseAdmin
      .from("registrations")
      .insert({
        exhibition_id: exhibition.id,
        visitor_id: visitor.id,
        registration_type_id,
        ticket_code,
        status: "confirmed",
        industry: industry || null,
        visit_purpose: visit_purpose?.length ? visit_purpose : null,
        companions: companions?.length ? companions : [],
      })
      .select()
      .single();

    if (regError) {
      console.error("Registration error:", regError);
      return NextResponse.json(
        { success: false, error: "登録に失敗しました" },
        { status: 500 },
      );
    }

    // セミナー予約
    if (seminar_ids?.length && registration) {
      const bookings = seminar_ids.map((seminar_id: string) => ({
        seminar_id,
        registration_id: registration.id,
        status: "confirmed",
      }));

      await supabaseAdmin.from("seminar_bookings").insert(bookings);
    }

    return NextResponse.json({
      success: true,
      ticket_code: registration.ticket_code,
      registration_id: registration.id,
    });
  } catch (err) {
    console.error("Registration API error:", err);
    return NextResponse.json(
      { success: false, error: "サーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
