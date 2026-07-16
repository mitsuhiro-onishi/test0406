import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth";
import { REGISTRATION_STATUSES, sanitizeSearchTerm } from "@/lib/validation";
import { getAuthorizedExhibitionIds } from "@/lib/admin-scope-server";
import {
  buildSignedTicketUrl,
  getTicketLinkExpiry,
  getTicketLinkSecret,
} from "@/lib/ticket-link";

const MAX_PER_PAGE = 100;

export async function GET(request: NextRequest) {
  const auth = await requireAdminApi();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const exhibition_id = searchParams.get("exhibition_id");
  const allowedIds = await getAuthorizedExhibitionIds(auth);
  if (allowedIds.length === 0) {
    return NextResponse.json({ registrations: [], total: 0, page: 1, per_page: 50, total_pages: 0 });
  }
  if (exhibition_id && !allowedIds.includes(exhibition_id)) {
    return NextResponse.json({ error: "展示会が見つかりません" }, { status: 404 });
  }
  const status = searchParams.get("status");
  const q = searchParams.get("q")?.trim();
  const page = Math.max(1, parseInt(searchParams.get("page") || "1") || 1);
  const per_page = Math.min(
    MAX_PER_PAGE,
    Math.max(1, parseInt(searchParams.get("per_page") || "50") || 50),
  );
  const sort = searchParams.get("sort") || "registered_at";
  const order = searchParams.get("order") || "desc";

  let query = supabaseAdmin
    .from("registrations")
    .select(
      `
      *,
      visitor:visitors!inner(*),
      exhibition:exhibitions(id, name, slug, end_date),
      registration_type:registration_types(name, color),
      entry_logs(action, logged_at)
    `,
      { count: "exact" },
    )
    .in("exhibition_id", allowedIds);

  // フィルター
  if (exhibition_id) {
    query = query.eq("exhibition_id", exhibition_id);
  }
  if (status && (REGISTRATION_STATUSES as readonly string[]).includes(status)) {
    query = query.eq("status", status);
  }

  // テキスト検索（visitor の名前・会社名・メール）
  if (q) {
    const term = sanitizeSearchTerm(q);
    if (term) {
      query = query.or(
        `last_name.ilike.%${term}%,first_name.ilike.%${term}%,company_name.ilike.%${term}%,email.ilike.%${term}%`,
        { foreignTable: "visitors" },
      );
    }
  }

  // ソート
  const ascending = order === "asc";
  if (sort === "name") {
    query = query.order("last_name", {
      foreignTable: "visitors",
      ascending,
    });
  } else if (sort === "company") {
    query = query.order("company_name", {
      foreignTable: "visitors",
      ascending,
    });
  } else {
    query = query.order("registered_at", { ascending });
  }

  // ページネーション
  const from = (page - 1) * per_page;
  const to = from + per_page - 1;
  query = query.range(from, to);

  const { data, count, error } = await query;

  if (error) {
    console.error("Registrations query error:", error);
    return NextResponse.json(
      { error: "データの取得に失敗しました" },
      { status: 500 },
    );
  }

  const ticketLinkSecret = getTicketLinkSecret();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const registrations = (data || []).map((registration) => {
    const exhibition = registration.exhibition as unknown as {
      slug: string;
      end_date: string;
    };
    return {
      ...registration,
      ticket_url: ticketLinkSecret
        ? buildSignedTicketUrl(
            {
              baseUrl,
              slug: exhibition.slug,
              code: registration.ticket_code,
              expires: getTicketLinkExpiry(exhibition.end_date),
              registrationUpdatedAt: registration.updated_at,
            },
            ticketLinkSecret,
          )
        : null,
    };
  });

  return NextResponse.json({
    registrations,
    total: count || 0,
    page,
    per_page,
    total_pages: Math.ceil((count || 0) / per_page),
  });
}
