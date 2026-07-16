import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendConfirmationEmail } from "@/lib/email";
import {
  persistPublicRegistration,
  publicRegistrationAccepted,
  publicRegistrationEmailFailed,
  PublicRegistrationPersistenceError,
  type PublicRegistrationRepository,
} from "@/lib/public-registration";
import { getClientIp } from "@/lib/rate-limit";
import { consumeRateLimit } from "@/lib/rate-limit-server";
import { isCapacityError } from "@/lib/capacity";
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
    const rl = await consumeRateLimit(`register:${ip}`, 10, 60_000);
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
      ).sort();
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

    // --- 来場者・登録の作成 ---
    // 注: visitors のユニークキーは式インデックス LOWER(email) のため
    // upsert(onConflict:"email") は使えない（ON CONFLICT 指定と一致せずエラーになる）
    // 旧データに大文字混じりメールが存在し得るため ilike で照合（LIKEメタ文字はエスケープ）
    const repository: PublicRegistrationRepository = {
      async findVisitorByEmail(normalizedEmail) {
        const emailPattern = normalizedEmail.replace(/([\\%_])/g, "\\$1");
        const { data, error } = await supabaseAdmin
          .from("visitors")
          .select("id")
          .ilike("email", emailPattern)
          .maybeSingle();
        if (error) {
          throw new PublicRegistrationPersistenceError("visitor", error);
        }
        return data;
      },
      async insertVisitor(values) {
        return supabaseAdmin
          .from("visitors")
          .insert(values)
          .select("id")
          .single();
      },
      async findRegistration(exhibitionId, visitorId) {
        const { data, error } = await supabaseAdmin
          .from("registrations")
          .select("id")
          .eq("exhibition_id", exhibitionId)
          .eq("visitor_id", visitorId)
          .maybeSingle();
        if (error) {
          throw new PublicRegistrationPersistenceError("registration", error);
        }
        return data;
      },
      async generateTicketCode() {
        const { data, error } = await supabaseAdmin.rpc("generate_ticket_code");
        if (error || typeof data !== "string" || !data) {
          throw new Error(error?.message || "Ticket code generation failed");
        }
        return data;
      },
      async insertRegistration(values) {
        return supabaseAdmin
          .from("registrations")
          .insert(values)
          .select("id")
          .single();
      },
    };

    let persistedRegistration;
    try {
      persistedRegistration = await persistPublicRegistration(repository, {
        email,
        visitorValues,
        registrationValues: {
          exhibition_id: exhibition.id,
          registration_type_id,
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
        },
      });
    } catch (error) {
      console.error("Public registration persistence error:", error);
      if (
        error instanceof PublicRegistrationPersistenceError &&
        error.stage === "registration" &&
        isCapacityError(error.dbError, "exhibition")
      ) {
        return NextResponse.json(
          { success: false, error: "登録数が上限に達しています" },
          { status: 409 },
        );
      }
      const message =
        error instanceof PublicRegistrationPersistenceError &&
        error.stage === "visitor"
          ? "来場者情報の登録に失敗しました"
          : "登録に失敗しました";
      return NextResponse.json(
        { success: false, error: message },
        { status: 500 },
      );
    }

    // --- セミナー予約 ---
    if (persistedRegistration.created && seminarIds.length > 0) {
      // ID順でロックを取得してデッドロックを避ける。最後の1席を同時に
      // 予約した場合、DB triggerで負けた側だけをwaitlistへ安全に移す。
      for (const seminar_id of seminarIds) {
        const booking = {
          seminar_id,
          registration_id: persistedRegistration.registrationId,
          status: "confirmed",
        };
        const { error: bookingError } = await supabaseAdmin
          .from("seminar_bookings")
          .insert(booking);

        if (!bookingError) continue;

        if (isCapacityError(bookingError, "seminar")) {
          const { error: waitlistError } = await supabaseAdmin
            .from("seminar_bookings")
            .insert({ ...booking, status: "waitlisted" });
          if (waitlistError) {
            console.error("Seminar waitlist error:", waitlistError);
          }
          continue;
        }

        // 予約失敗でも登録自体は成立させる（当日受付で対応可能）
        console.error("Seminar booking error:", bookingError);
      }
    }

    // --- 確認メール送信 ---
    // 公開レスポンスにチケットを含めないため、メール失敗時は安全に再試行できる503を返す
    // サーバーレス環境ではレスポンス後の処理が中断されるため await する
    try {
      const emailResult = await sendConfirmationEmail(
        persistedRegistration.registrationId,
      );
      if (!emailResult.success) {
        console.error("Auto confirmation email failed:", emailResult.error);
        return NextResponse.json(publicRegistrationEmailFailed(), {
          status: 503,
        });
      }
    } catch (emailErr) {
      console.error("Auto confirmation email failed:", emailErr);
      return NextResponse.json(publicRegistrationEmailFailed(), {
        status: 503,
      });
    }

    return NextResponse.json(publicRegistrationAccepted());
  } catch (err) {
    console.error("Registration API error:", err);
    return NextResponse.json(
      { success: false, error: "サーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
