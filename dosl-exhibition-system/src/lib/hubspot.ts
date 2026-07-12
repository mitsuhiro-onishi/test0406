import { supabaseAdmin } from "@/lib/supabase/server";
import type { Exhibition, Registration, Visitor } from "@/types/database";

// HubSpot CRM連携（Phase 1: 来場者コンタクト同期）
//
// - HUBSPOT_SYNC_ENABLED=true かつ HUBSPOT_ACCESS_TOKEN 設定時のみ動作する。
//   未設定なら何もしない（既存機能への影響ゼロ）。
// - 同期対象は status=confirmed の登録のみ。HUBSPOT_SYNC_SINCE（ISO日付）を
//   設定すると、それ以降に登録されたもののみ同期する（同意文言改訂前の
//   既存登録者をCRM蓄積から除外するための運用スイッチ）。
// - メールアドレスをキーにコンタクトをupsertするため、何度実行しても
//   重複は発生しない（冪等）。
// - exhibitor_leads（ブーススキャン）と entry_logs はPhase 1では同期しない。
//   gate_last_checkin プロパティはPhase 2（entry_logs同期）で使用予定。
// - カスタムオブジェクトは使わない（無料プランで完結する設計）。

const HUBSPOT_API_BASE = "https://api.hubapi.com";

// 無料プランのレート制限は100リクエスト/10秒。バッチAPI中心のため
// リクエスト数は少ないが、安全側に倒して直列実行＋間隔を空ける。
const REQUEST_INTERVAL_MS = 150;

export function isHubspotSyncEnabled(): boolean {
  return (
    process.env.HUBSPOT_SYNC_ENABLED === "true" &&
    !!process.env.HUBSPOT_ACCESS_TOKEN
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class HubspotApiError extends Error {
  constructor(
    public status: number,
    public path: string,
    public body: string,
  ) {
    super(`HubSpot API ${status} at ${path}: ${body.slice(0, 300)}`);
    this.name = "HubspotApiError";
  }
}

async function hubspotFetch<T>(
  path: string,
  init: { method: string; body?: unknown },
): Promise<T> {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  await sleep(REQUEST_INTERVAL_MS);

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${HUBSPOT_API_BASE}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      // Next.jsのfetchデータキャッシュを無効化（GETが古いレスポンスを返すのを防ぐ）
      cache: "no-store",
    });

    // レート制限時は Retry-After を尊重してリトライ
    if (res.status === 429 && attempt < 2) {
      const retryAfter = Number(res.headers.get("Retry-After")) || 10;
      await sleep(retryAfter * 1000);
      continue;
    }

    if (!res.ok) {
      throw new HubspotApiError(res.status, path, await res.text());
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
  throw new HubspotApiError(429, path, "rate limited after retries");
}

// ------------------------------------------------------------
// コンタクト upsert（email キー・バッチ最大100件）
// ------------------------------------------------------------

interface ContactUpsertInput {
  email: string;
  properties: Record<string, string>;
}

interface BatchUpsertResult {
  results: { id: string; properties: { email?: string } }[];
}

/** email → HubSpotコンタクトID のマップを返す */
async function batchUpsertContacts(
  inputs: ContactUpsertInput[],
): Promise<Map<string, string>> {
  const contactIdByEmail = new Map<string, string>();
  for (let i = 0; i < inputs.length; i += 100) {
    const chunk = inputs.slice(i, i + 100);
    const res = await hubspotFetch<BatchUpsertResult>(
      "/crm/v3/objects/contacts/batch/upsert",
      {
        method: "POST",
        body: {
          inputs: chunk.map((c) => ({
            idProperty: "email",
            id: c.email,
            properties: c.properties,
          })),
        },
      },
    );
    for (const r of res.results) {
      if (r.properties.email) {
        contactIdByEmail.set(r.properties.email.toLowerCase(), r.id);
      }
    }
  }
  return contactIdByEmail;
}

// ------------------------------------------------------------
// 会社の検索・作成・関連付け（会社名の表記ゆれは割り切り＝完全一致のみ）
//
// 注意: HubSpotの検索APIは反映が非同期（新規作成が検索に載るまで数秒〜数分）。
// 同期を数分以内に連続実行すると同名会社が重複作成されうる。
// 本番運用は1日1回のcronのため実害なし。手動実行は間隔を空けること。
// ------------------------------------------------------------

interface CompanySearchResult {
  total: number;
  results: { id: string }[];
}

async function findOrCreateCompanyByName(
  name: string,
  cache: Map<string, string>,
): Promise<string> {
  const cached = cache.get(name);
  if (cached) return cached;

  const search = await hubspotFetch<CompanySearchResult>(
    "/crm/v3/objects/companies/search",
    {
      method: "POST",
      body: {
        filterGroups: [
          {
            filters: [{ propertyName: "name", operator: "EQ", value: name }],
          },
        ],
        limit: 1,
      },
    },
  );

  let companyId: string;
  if (search.total > 0) {
    companyId = search.results[0].id;
  } else {
    const created = await hubspotFetch<{ id: string }>(
      "/crm/v3/objects/companies",
      { method: "POST", body: { properties: { name } } },
    );
    companyId = created.id;
  }
  cache.set(name, companyId);
  return companyId;
}

async function associateContactWithCompany(
  contactId: string,
  companyId: string,
): Promise<void> {
  await hubspotFetch<unknown>(
    `/crm/v4/objects/contacts/${contactId}/associations/default/companies/${companyId}`,
    { method: "PUT" },
  );
}

// ------------------------------------------------------------
// 展示会別の静的リスト
// ------------------------------------------------------------

async function findOrCreateStaticList(
  name: string,
  cache: Map<string, string>,
): Promise<string> {
  const cached = cache.get(name);
  if (cached) return cached;

  // 検索API（/crm/v3/lists/search）はインデックス反映が非同期で、
  // 削除済みリストを返す・作成直後のリストを見落とす問題があるため、
  // 即時一貫性のある名前直接取得エンドポイントを使う
  let listId: string;
  try {
    const found = await hubspotFetch<{ list: { listId: string } }>(
      `/crm/v3/lists/object-type-id/0-1/name/${encodeURIComponent(name)}`,
      { method: "GET" },
    );
    listId = found.list.listId;
  } catch (e) {
    if (!(e instanceof HubspotApiError) || e.status !== 404) throw e;
    const created = await hubspotFetch<{ list: { listId: string } }>(
      "/crm/v3/lists",
      {
        method: "POST",
        body: { name, objectTypeId: "0-1", processingType: "MANUAL" },
      },
    );
    listId = created.list.listId;
  }
  cache.set(name, listId);
  return listId;
}

async function addContactsToList(
  listId: string,
  contactIds: string[],
): Promise<void> {
  for (let i = 0; i < contactIds.length; i += 100) {
    await hubspotFetch<unknown>(`/crm/v3/lists/${listId}/memberships/add`, {
      method: "PUT",
      body: contactIds.slice(i, i + 100),
    });
  }
}

// ------------------------------------------------------------
// 同期本体
// ------------------------------------------------------------

type RegistrationRow = Pick<
  Registration,
  "id" | "visitor_id" | "exhibition_id" | "industry" | "visit_purpose" | "registered_at"
> & {
  visitor: Visitor;
  exhibition: Pick<Exhibition, "id" | "name" | "slug">;
};

export interface HubspotSyncResult {
  enabled: boolean;
  mode: "incremental" | "full";
  visitors_synced: number;
  companies_linked: number;
  lists_updated: string[];
  errors: string[];
}

/**
 * Supabaseの登録データをHubSpotへ同期する。
 * @param full true なら全件同期、false なら直近の更新分のみ（差分同期）
 */
export async function syncToHubspot(full: boolean): Promise<HubspotSyncResult> {
  const result: HubspotSyncResult = {
    enabled: true,
    mode: full ? "full" : "incremental",
    visitors_synced: 0,
    companies_linked: 0,
    lists_updated: [],
    errors: [],
  };

  const syncSince = process.env.HUBSPOT_SYNC_SINCE || null;
  const lookbackHours = Number(process.env.HUBSPOT_SYNC_LOOKBACK_HOURS) || 25;

  // Supabaseは1クエリ最大1000行のため、ページネーションで全件取得する
  const PAGE_SIZE = 1000;
  async function fetchAllPages<T>(
    buildQuery: (from: number, to: number) => PromiseLike<{
      data: T[] | null;
      error: { message: string } | null;
    }>,
    label: string,
  ): Promise<T[]> {
    const all: T[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(`Supabase${label}取得に失敗: ${error.message}`);
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE_SIZE) break;
    }
    return all;
  }

  // 1. 同期対象の登録を特定（差分 = 直近 lookbackHours 時間に更新された登録）
  const cutoff = new Date(
    Date.now() - lookbackHours * 3600 * 1000,
  ).toISOString();
  const changed = await fetchAllPages<{
    visitor_id: string;
    exhibition_id: string;
  }>((from, to) => {
    let q = supabaseAdmin
      .from("registrations")
      .select("visitor_id, exhibition_id")
      .eq("status", "confirmed")
      .order("id")
      .range(from, to);
    if (syncSince) q = q.gte("registered_at", syncSince);
    if (!full) q = q.gte("updated_at", cutoff);
    return q;
  }, "差分");
  if (changed.length === 0) return result;

  const visitorIds = Array.from(new Set(changed.map((r) => r.visitor_id)));
  const changedExhibitionIds = new Set(changed.map((r) => r.exhibition_id));

  // 2. 対象来場者の全登録を取得（来場回数・最終展示会の集計に全履歴が必要）
  //    URL長制限を避けるため visitor_id は500件ずつに分けて問い合わせる
  const rows: unknown[] = [];
  for (let i = 0; i < visitorIds.length; i += 500) {
    const idChunk = visitorIds.slice(i, i + 500);
    const chunkRows = await fetchAllPages<unknown>((from, to) => {
      let q = supabaseAdmin
        .from("registrations")
        .select(
          `
          id, visitor_id, exhibition_id, industry, visit_purpose, registered_at,
          visitor:visitors(*),
          exhibition:exhibitions(id, name, slug)
        `,
        )
        .eq("status", "confirmed")
        .in("visitor_id", idChunk)
        .order("id")
        .range(from, to);
      if (syncSince) q = q.gte("registered_at", syncSince);
      return q;
    }, "登録");
    rows.push(...chunkRows);
  }

  // 3. 来場者ごとに集計してコンタクトプロパティを組み立てる
  const byVisitor = new Map<string, RegistrationRow[]>();
  for (const row of rows as RegistrationRow[]) {
    if (!row.visitor || !row.exhibition) continue;
    const list = byVisitor.get(row.visitor_id) || [];
    list.push(row);
    byVisitor.set(row.visitor_id, list);
  }

  const contactInputs: ContactUpsertInput[] = [];
  const companyByEmail = new Map<string, string>(); // email → 会社名
  for (const regs of Array.from(byVisitor.values())) {
    regs.sort((a, b) => a.registered_at.localeCompare(b.registered_at));
    const latest = regs[regs.length - 1];
    const visitor = latest.visitor;
    const email = visitor.email.toLowerCase();

    const properties: Record<string, string> = {
      email,
      firstname: visitor.first_name,
      lastname: visitor.last_name,
      gate_visitor_id: visitor.id,
      gate_last_exhibition: latest.exhibition.name,
      // Phase 1では「登録した展示会数」を来場回数の代替値として同期する。
      // 実来場（entry_logs）ベースへの置き換えはPhase 2。
      gate_visit_count: String(regs.length),
    };
    if (visitor.company_name) {
      properties.company = visitor.company_name;
      companyByEmail.set(email, visitor.company_name);
    }
    if (visitor.phone) properties.phone = visitor.phone;
    if (visitor.position) properties.jobtitle = visitor.position;
    if (latest.industry) properties.gate_industry = latest.industry;
    if (latest.visit_purpose && latest.visit_purpose.length > 0) {
      properties.gate_visit_purpose = latest.visit_purpose.join(";");
    }
    contactInputs.push({ email, properties });
  }

  // 4. コンタクトをemailキーでupsert
  const contactIdByEmail = await batchUpsertContacts(contactInputs);
  result.visitors_synced = contactIdByEmail.size;

  // 5. 会社の作成・関連付け（失敗しても他の来場者の同期は続行）
  const companyCache = new Map<string, string>();
  for (const [email, companyName] of Array.from(companyByEmail.entries())) {
    const contactId = contactIdByEmail.get(email);
    if (!contactId) continue;
    try {
      const companyId = await findOrCreateCompanyByName(
        companyName,
        companyCache,
      );
      await associateContactWithCompany(contactId, companyId);
      result.companies_linked++;
    } catch (e) {
      result.errors.push(
        `会社関連付け失敗 (${companyName}): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // 6. 展示会別の静的リストへ追加（今回変更のあった展示会のみ）
  const listCache = new Map<string, string>();
  for (const exhibitionId of Array.from(changedExhibitionIds)) {
    const regsForExhibition = (rows as RegistrationRow[]).filter(
      (r) => r.exhibition_id === exhibitionId && r.exhibition,
    );
    if (regsForExhibition.length === 0) continue;
    const listName = `GATE: ${regsForExhibition[0].exhibition.name}`;
    const memberIds = regsForExhibition
      .map((r) => contactIdByEmail.get(r.visitor.email.toLowerCase()))
      .filter((id): id is string => !!id);
    if (memberIds.length === 0) continue;
    try {
      const listId = await findOrCreateStaticList(listName, listCache);
      await addContactsToList(listId, memberIds);
      result.lists_updated.push(listName);
    } catch (e) {
      result.errors.push(
        `リスト更新失敗 (${listName}): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return result;
}
