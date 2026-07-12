import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendConfirmationEmail } from "@/lib/email";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import {
  cleanText,
  fieldLabel,
  isValidEmail,
  validateCompanions,
  validateVisitorFields,
  type FieldError,
} from "@/lib/validation";

// 展示会設定 form_fields で制御される来場者フィールド
const CONFIGURABLE_VISITOR_FIELDS = [
  "company_name",
  "company_kana",
  "department",
  "position",
  "phone",
  "postal_code",
  "address",
] as const;

function badRequest(message: string, errors?: FieldError[]) {
  return NextResponse.json(
    { success: false, error: message, field_errors: errors },
    { status: 400 },
  );
}

export async function POST(request: NextRequest) {
  try {
    // レート制限: スパム登録防止（IPごと 10回/分）
    const ip = getClientIp(request);
    const rl = rateLimit(`register:${ip}`, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: "リクエストが多すぎます。しばらくしてからお試しください" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }

    const body = await request.json();

    // --- 基本バリデーション（DBアクセス前） ---
    const slug = cleanText(body.slug);
    const email = cleanText(body.email)?.toLowerCase() ?? null;
    const lastName = cleanText(body.last_name);
    const firstName = cleanText(body.first_name);

    if (!slug || !email || !lastName || !firstName) {
      return badRequest("必須項目が入力されていません");
    }
    if (!isValidEmail(email)) {
      return badRequest("メールアドレスの形式が正しくありません");
    }

    const { values: visitorValues, errors: visitorErrors } =
      validateVisitorFields({
        last_name: lastName,
        first_name: firstName,
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
      return badRequest(visitorErrors[0].message, visitorErrors);
    }

    // --- 展示会を取得 ---
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

    const formFields = exhibition.form_fields || {};
    const features = exhibition.features || {};

    // --- 個人情報の取り扱い同意（全展示会で必須・HubSpot連携同意文言改訂 2026-07-12） ---
    // 主催者の運営利用＋DOSLの今後の案内目的（＋lead_retrieval時は出展社提供）への同意
    if (body.lead_consent !== true) {
      return badRequest("個人情報の取り扱いへの同意が必要です");
    }

    // --- form_fields 設定に基づく検証 ---
    // 非表示フィールドの値は保存しない
    for (const field of CONFIGURABLE_VISITOR_FIELDS) {
      if (!formFields[field]?.visible) {
        delete visitorValues[field];
      }
    }
    // required=true の空チェック
    for (const field of CONFIGURABLE_VISITOR_FIELDS) {
      const config = formFields[field];
      if (config?.visible && config?.required && !visitorValues[field]) {
        return badRequest(`${fieldLabel(field)}を入力してください`);
      }
    }

    // --- 業種・来場目的（選択肢ホワイトリスト検証） ---
    let industry: string | null = null;
    if (formFields.industry?.visible) {
      const v = cleanText(body.industry);
      if (v !== null) {
        if (!(exhibition.industry_options || []).includes(v)) {
          return badRequest("業種の選択値が不正です");
        }
        industry = v;
      } else if (formFields.industry.required) {
        return badRequest("業種を選択してください");
      }
    }

    let visitPurpose: string[] | null = null;
    if (formFields.visit_purpose?.visible) {
      const raw = body.visit_purpose;
      if (raw !== undefined && raw !== null) {
        if (!Array.isArray(raw)) {
          return badRequest("来場目的の形式が不正です");
        }
        const options: string[] = exhibition.purpose_options || [];
        const purposes = raw.map((p) => cleanText(p)).filter(Boolean) as string[];
        if (purposes.some((p) => !options.includes(p))) {
          return badRequest("来場目的の選択値が不正です");
        }
        visitPurpose = purposes.length > 0 ? purposes : null;
      }
      if (formFields.visit_purpose.required && !visitPurpose) {
        return badRequest("来場目的を選択してください");
      }
    }

    // --- 同伴者（構造・人数・文字数検証） ---
    let companions: ReturnType<typeof validateCompanions>["companions"] = [];
    if (formFields.companions?.visible && features.companion) {
      const maxCompanions = formFields.companions.max || 4;
      const result = validateCompanions(body.companions, maxCompanions);
      if (result.errors.length > 0) {
        return badRequest(result.errors[0].message, result.errors);
      }
      companions = result.companions;
    }

    // --- 登録種別（展示会に種別定義がある場合は必須） ---
    let registration_type_id: string | null = null;
    const { data: regTypes } = await supabaseAdmin
      .from("registration_types")
      .select("id, slug, requires_code")
      .eq("exhibition_id", exhibition.id);

    const publicTypes = (regTypes || []).filter((t) => !t.requires_code);
    if (publicTypes.length > 0) {
      const typeSlug = cleanText(body.registration_type_slug);
      if (!typeSlug) {
        return badRequest("登録種別を選択してください");
      }
      const regType = publicTypes.find((t) => t.slug === typeSlug);
      if (!regType) {
        // requires_code=true の招待制種別は公開フォームから選択不可
        return badRequest("登録種別の選択値が不正です");
      }
      registration_type_id = regType.id;
    }

    // --- セミナー（実在・公開中・定員チェック） ---
    let seminarIds: string[] = [];
    if (features.seminar && Array.isArray(body.seminar_ids) && body.seminar_ids.length > 0) {
      const requested: string[] = Array.from(
        new Set(
          (body.seminar_ids as unknown[]).filter(
            (s): s is string => typeof s === "string",
          ),
        ),
      );
      const { data: seminars } = await supabaseAdmin
        .from("seminars")
        .select("id, title, capacity")
        .eq("exhibition_id", exhibition.id)
        .eq("status", "open")
        .in("id", requested);

      if (!seminars || seminars.length !== requested.length) {
        return badRequest("選択されたセミナーが見つかりません");
      }
      for (const seminar of seminars) {
        if (seminar.capacity == null) continue;
        const { count } = await supabaseAdmin
          .from("seminar_bookings")
          .select("*", { count: "exact", head: true })
          .eq("seminar_id", seminar.id)
          .eq("status", "confirmed");
        if ((count || 0) >= seminar.capacity) {
          return badRequest(`「${seminar.title}」は定員に達しています`);
        }
      }
      seminarIds = requested;
    }

    // --- 登録上限チェック ---
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

    // --- 来場者の取得・更新 or 作成 ---
    // 注: visitors のユニークキーは式インデックス LOWER(email) のため
    // upsert(onConflict:"email") は使えない（ON CONFLICT 指定と一致せずエラーになる）
    // 旧データに大文字混じりメールが存在し得るため ilike で照合（LIKEメタ文字はエスケープ）
    const emailPattern = email.replace(/([\\%_])/g, "\\$1");
    const { data: existingVisitor } = await supabaseAdmin
      .from("visitors")
      .select("id")
      .ilike("email", emailPattern)
      .maybeSingle();

    // 既存来場者は「今回入力のあった項目のみ」更新する（別展示会での登録情報を消さない）
    let visitor: { id: string } | null = null;

    if (existingVisitor) {
      // 空欄で送られた項目（null）は既存値を保持する。フォームは未入力項目を
      // 空文字で送るため、nullを含めて更新すると既存の値が消えてしまう
      const updateValues = Object.fromEntries(
        Object.entries(visitorValues).filter(([, v]) => v !== null),
      );
      const { data, error } = await supabaseAdmin
        .from("visitors")
        .update(updateValues)
        .eq("id", existingVisitor.id)
        .select("id")
        .single();
      if (error || !data) {
        console.error("Visitor update error:", error);
        return NextResponse.json(
          { success: false, error: "来場者情報の登録に失敗しました" },
          { status: 500 },
        );
      }
      visitor = data;
    } else {
      const { data, error } = await supabaseAdmin
        .from("visitors")
        .insert({ email, ...visitorValues })
        .select("id")
        .single();
      if (error || !data) {
        // 同時登録による一意制約違反は取り直す
        if (error?.code === "23505") {
          const { data: retry } = await supabaseAdmin
            .from("visitors")
            .select("id")
            .ilike("email", emailPattern)
            .maybeSingle();
          visitor = retry;
        }
        if (!visitor) {
          console.error("Visitor insert error:", error);
          return NextResponse.json(
            { success: false, error: "来場者情報の登録に失敗しました" },
            { status: 500 },
          );
        }
      } else {
        visitor = data;
      }
    }

    // --- 重複登録チェック（既存なら既存チケットを返す） ---
    const { data: existing } = await supabaseAdmin
      .from("registrations")
      .select("id, ticket_code")
      .eq("exhibition_id", exhibition.id)
      .eq("visitor_id", visitor.id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        success: true,
        ticket_code: existing.ticket_code,
        registration_id: existing.id,
        message: "既に登録済みです",
      });
    }

    // --- チケットコード生成・登録作成 ---
    const { data: ticketResult } = await supabaseAdmin.rpc(
      "generate_ticket_code",
    );
    const ticket_code = ticketResult as string;

    const { data: registration, error: regError } = await supabaseAdmin
      .from("registrations")
      .insert({
        exhibition_id: exhibition.id,
        visitor_id: visitor.id,
        registration_type_id,
        ticket_code,
        status: "confirmed",
        industry,
        visit_purpose: visitPurpose,
        companions,
        // 同意の記録（同意日時）。privacy_consent=常時（運営利用+DOSL案内目的）、
        // lead_consent=リードリトリーバル有効時のみ（出展社提供。既存データとの互換キー）
        custom_fields: {
          privacy_consent: { agreed: true, at: new Date().toISOString() },
          ...(features.lead_retrieval
            ? { lead_consent: { agreed: true, at: new Date().toISOString() } }
            : {}),
        },
      })
      .select()
      .single();

    if (regError || !registration) {
      // 同時登録による (exhibition_id, visitor_id) 一意制約違反は既存を返す
      if (regError?.code === "23505") {
        const { data: dup } = await supabaseAdmin
          .from("registrations")
          .select("id, ticket_code")
          .eq("exhibition_id", exhibition.id)
          .eq("visitor_id", visitor.id)
          .maybeSingle();
        if (dup) {
          return NextResponse.json({
            success: true,
            ticket_code: dup.ticket_code,
            registration_id: dup.id,
            message: "既に登録済みです",
          });
        }
      }
      console.error("Registration error:", regError);
      return NextResponse.json(
        { success: false, error: "登録に失敗しました" },
        { status: 500 },
      );
    }

    // --- セミナー予約 ---
    if (seminarIds.length > 0) {
      const bookings = seminarIds.map((seminar_id) => ({
        seminar_id,
        registration_id: registration.id,
        status: "confirmed",
      }));
      const { error: bookingError } = await supabaseAdmin
        .from("seminar_bookings")
        .insert(bookings);
      if (bookingError) {
        // 予約失敗でも登録自体は成立させる（当日受付で対応可能）
        console.error("Seminar booking error:", bookingError);
      }
    }

    // --- 確認メール送信（失敗しても登録は成功扱い） ---
    // サーバーレス環境ではレスポンス後の処理が中断されるため await する
    try {
      const emailResult = await sendConfirmationEmail(registration.id);
      if (!emailResult.success) {
        console.error("Auto confirmation email failed:", emailResult.error);
      }
    } catch (emailErr) {
      console.error("Auto confirmation email failed:", emailErr);
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
