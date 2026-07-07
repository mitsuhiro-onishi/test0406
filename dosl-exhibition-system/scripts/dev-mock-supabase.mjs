// ============================================================
// 開発用モック Supabase サーバー（実DBなしで実ブラウザ検証するための開発ツール）
//
// 実 Supabase（GoTrue + PostgREST）のうち、本アプリが使う範囲だけを
// インメモリで模倣する。データは起動時に supabase/seed.sql 相当で初期化され、
// プロセス終了で消える。
//
// 起動:  node scripts/dev-mock-supabase.mjs   (port 54321)
// .env.local を以下に向ける:
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=mock-anon-key
//   SUPABASE_SERVICE_ROLE_KEY=mock-service-key
//
// テストログイン: admin@dosl.dev / devpass123
//
// 注意: これは検証補助であり、実 Supabase の完全な代替ではない。
// ON CONFLICT の細かい仕様・RLS・PostgREST の埋め込みフィルタの
// エイリアス解決などは簡略化している。本番前の実DB通し確認は別途必須。
// ============================================================

import http from "node:http";
import crypto from "node:crypto";

const PORT = Number(process.env.MOCK_SUPABASE_PORT || 54321);

// ---------- ユーティリティ ----------
const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function mintJwt(user, expiresInSec) {
  const iat = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    email: user.email,
    aud: "authenticated",
    role: "authenticated",
    iat,
    exp: iat + expiresInSec,
    session_id: uuid(),
  };
  return `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(payload)}.mocksig`;
}

// ---------- 認証ユーザー ----------
const AUTH_USERS = [
  {
    id: "00000000-0000-0000-0000-aaaaaaaaaaaa",
    email: "admin@dosl.dev",
    password: "devpass123",
  },
];

// access_token -> { userId, exp } / refresh_token -> userId
const accessTokens = new Map();
const refreshTokens = new Map();

function publicUser(u) {
  const t = now();
  return {
    id: u.id,
    aud: "authenticated",
    role: "authenticated",
    email: u.email,
    email_confirmed_at: t,
    phone: "",
    confirmed_at: t,
    last_sign_in_at: t,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    created_at: t,
    updated_at: t,
  };
}

function issueSession(u) {
  const expiresIn = 3600;
  const accessToken = mintJwt(u, expiresIn);
  const refreshToken = crypto.randomBytes(24).toString("hex");
  accessTokens.set(accessToken, {
    userId: u.id,
    exp: Date.now() + expiresIn * 1000,
  });
  refreshTokens.set(refreshToken, u.id);
  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: expiresIn,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    refresh_token: refreshToken,
    user: publicUser(u),
  };
}

// ---------- インメモリDB（supabase/seed.sql 相当 + 検証用追加データ） ----------
const ORG_ID = "00000000-0000-0000-0000-000000000001";
const EXH_ID = "00000000-0000-0000-0000-000000000010";
const SEM1 = "00000000-0000-0000-0000-000000000401";
const SEM2 = "00000000-0000-0000-0000-000000000402";
const SEM3 = "00000000-0000-0000-0000-000000000403";

const db = {
  organizations: [
    { id: ORG_ID, name: "DOSL", slug: "dosl", created_at: now(), updated_at: now() },
  ],
  exhibitions: [
    {
      id: EXH_ID,
      organization_id: ORG_ID,
      name: "サンプル展示会 2026",
      slug: "sample-exhibition-2026",
      description: "DOSLの事前登録システム動作確認用サンプル展示会",
      status: "published",
      start_date: "2026-06-01",
      end_date: "2026-06-02",
      venue_name: "サンプル会場",
      venue_address: "東京都千代田区...",
      max_registrations: null,
      form_fields: {
        company_name: { visible: true, required: true },
        company_kana: { visible: true, required: true },
        department: { visible: true, required: false },
        position: { visible: true, required: false },
        phone: { visible: true, required: false },
        postal_code: { visible: false, required: false },
        address: { visible: false, required: false },
        industry: { visible: true, required: false },
        visit_purpose: { visible: true, required: false },
        companions: { visible: true, required: false, max: 4 },
      },
      branding: {
        primary_color: "#4a90d9",
        secondary_color: "#6db0f0",
        logo_url: null,
        banner_url: null,
        copyright: "Copyright © DOSL Inc.",
      },
      features: {
        seminar: true,
        companion: true,
        lead_retrieval: true,
        entry_number: false,
        badge_print: false,
        exit_tracking: false,
      },
      industry_options: [
        "製造業", "建設業", "卸売業", "小売業", "飲食業", "サービス業",
        "IT・通信", "不動産業", "運輸業", "金融・保険業", "医療・福祉",
        "教育", "官公庁・団体", "その他",
      ],
      purpose_options: ["情報収集", "商談・取引", "技術調査", "新製品確認", "その他"],
      email_settings: {},
      created_at: now(),
      updated_at: now(),
    },
  ],
  registration_types: [
    { id: "00000000-0000-0000-0000-000000000501", exhibition_id: EXH_ID, name: "一般来場者", slug: "general", color: "#333333", requires_code: false, sort_order: 1, created_at: now(), updated_at: now() },
    { id: "00000000-0000-0000-0000-000000000502", exhibition_id: EXH_ID, name: "VIP", slug: "vip", color: "#FFD700", requires_code: false, sort_order: 2, created_at: now(), updated_at: now() },
    { id: "00000000-0000-0000-0000-000000000503", exhibition_id: EXH_ID, name: "プレス", slug: "press", color: "#FF6347", requires_code: false, sort_order: 3, created_at: now(), updated_at: now() },
  ],
  seminars: [
    { id: SEM1, exhibition_id: EXH_ID, title: "基調講演: DX最前線", description: "デジタルトランスフォーメーションの最新動向", speaker_name: "山田太郎", speaker_title: "代表取締役", venue_name: "メインホール", capacity: 200, starts_at: "2026-06-01T10:00:00+09:00", ends_at: "2026-06-01T11:30:00+09:00", status: "open", sort_order: 0, created_at: now(), updated_at: now() },
    { id: SEM2, exhibition_id: EXH_ID, title: "ワークショップ: IoT入門", description: "ハンズオン形式のIoTワークショップ", speaker_name: "鈴木次郎", speaker_title: "技術部長", venue_name: "会議室A", capacity: 30, starts_at: "2026-06-01T13:00:00+09:00", ends_at: "2026-06-01T14:30:00+09:00", status: "open", sort_order: 0, created_at: now(), updated_at: now() },
    { id: SEM3, exhibition_id: EXH_ID, title: "パネルディスカッション: AI活用", description: "各社のAI活用事例を議論", speaker_name: "複数登壇者", speaker_title: "", venue_name: "メインホール", capacity: 200, starts_at: "2026-06-02T10:00:00+09:00", ends_at: "2026-06-02T12:00:00+09:00", status: "open", sort_order: 0, created_at: now(), updated_at: now() },
  ],
  admin_users: [
    { id: "00000000-0000-0000-0000-000000000100", auth_user_id: "00000000-0000-0000-0000-aaaaaaaaaaaa", organization_id: ORG_ID, display_name: "テスト管理者", role: "owner", is_active: true, created_at: now(), updated_at: now() },
  ],
  visitors: [
    { id: "00000000-0000-0000-0000-000000000200", email: "test@example.com", last_name: "田中", first_name: "一郎", last_name_kana: "タナカ", first_name_kana: "イチロウ", company_name: "テスト株式会社", company_kana: null, department: "営業部", position: null, phone: "03-1234-5678", postal_code: null, address: null, created_at: now(), updated_at: now() },
    { id: "00000000-0000-0000-0000-000000000201", email: "hanako@example.com", last_name: "佐藤", first_name: "花子", last_name_kana: "サトウ", first_name_kana: "ハナコ", company_name: "サンプル商事", company_kana: null, department: "総務部", position: "課長", phone: "06-9876-5432", postal_code: null, address: null, created_at: now(), updated_at: now() },
  ],
  registrations: [
    { id: "00000000-0000-0000-0000-000000000300", exhibition_id: EXH_ID, visitor_id: "00000000-0000-0000-0000-000000000200", registration_type_id: "00000000-0000-0000-0000-000000000501", ticket_code: "TEST1234", status: "confirmed", industry: "製造業", visit_purpose: ["情報収集", "新製品確認"], companions: [], custom_fields: {}, invitation_code_id: null, entry_number: null, registered_at: now(), updated_at: now() },
    { id: "00000000-0000-0000-0000-000000000301", exhibition_id: EXH_ID, visitor_id: "00000000-0000-0000-0000-000000000201", registration_type_id: "00000000-0000-0000-0000-000000000501", ticket_code: "TEST5678", status: "confirmed", industry: "サービス業", visit_purpose: ["商談・取引"], companions: [], custom_fields: {}, invitation_code_id: null, entry_number: null, registered_at: now(), updated_at: now() },
  ],
  seminar_bookings: [
    { id: "00000000-0000-0000-0000-000000000601", seminar_id: SEM1, registration_id: "00000000-0000-0000-0000-000000000300", status: "confirmed", checked_in_at: null, booked_at: now(), updated_at: now() },
    { id: "00000000-0000-0000-0000-000000000602", seminar_id: SEM1, registration_id: "00000000-0000-0000-0000-000000000301", status: "confirmed", checked_in_at: null, booked_at: now(), updated_at: now() },
  ],
  entry_logs: [],
  invitation_codes: [],
  // GATEオプション用（マイグレーション004相当）。存在しなくても既存機能に影響なし
  exhibitors: [
    { id: "00000000-0000-0000-0000-000000000700", exhibition_id: EXH_ID, name: "サンプル出展社", booth_number: "A-12", contact_name: "出展 太郎", contact_email: null, access_code: "DEMOBOOTH234", is_active: true, created_at: now(), updated_at: now() },
  ],
  exhibitor_leads: [],
};

// FK定義: 埋め込みリソースの解決に使う
const FOREIGN_KEYS = [
  { table: "exhibitions", column: "organization_id", references: "organizations" },
  { table: "registration_types", column: "exhibition_id", references: "exhibitions" },
  { table: "seminars", column: "exhibition_id", references: "exhibitions" },
  { table: "visitors", column: null, references: null },
  { table: "registrations", column: "exhibition_id", references: "exhibitions" },
  { table: "registrations", column: "visitor_id", references: "visitors" },
  { table: "registrations", column: "registration_type_id", references: "registration_types" },
  { table: "seminar_bookings", column: "seminar_id", references: "seminars" },
  { table: "seminar_bookings", column: "registration_id", references: "registrations" },
  { table: "entry_logs", column: "registration_id", references: "registrations" },
  { table: "admin_users", column: "organization_id", references: "organizations" },
  { table: "exhibitors", column: "exhibition_id", references: "exhibitions" },
  { table: "exhibitor_leads", column: "exhibitor_id", references: "exhibitors" },
  { table: "exhibitor_leads", column: "registration_id", references: "registrations" },
];

// INSERT時のデフォルト値
const ROW_DEFAULTS = {
  organizations: () => ({ id: uuid(), created_at: now(), updated_at: now() }),
  exhibitions: () => ({ id: uuid(), status: "draft", form_fields: {}, branding: {}, features: {}, email_settings: {}, created_at: now(), updated_at: now() }),
  registration_types: () => ({ id: uuid(), requires_code: false, sort_order: 0, created_at: now(), updated_at: now() }),
  seminars: () => ({ id: uuid(), description: null, speaker_name: null, speaker_title: null, venue_name: null, capacity: null, status: "open", sort_order: 0, created_at: now(), updated_at: now() }),
  visitors: () => ({ id: uuid(), last_name_kana: null, first_name_kana: null, company_name: null, company_kana: null, department: null, position: null, phone: null, postal_code: null, address: null, created_at: now(), updated_at: now() }),
  registrations: () => ({ id: uuid(), registration_type_id: null, status: "confirmed", industry: null, visit_purpose: null, companions: [], custom_fields: {}, invitation_code_id: null, entry_number: null, registered_at: now(), updated_at: now() }),
  seminar_bookings: () => ({ id: uuid(), status: "confirmed", checked_in_at: null, booked_at: now(), updated_at: now() }),
  entry_logs: () => ({ id: uuid(), action: "entry", gate: null, method: "qr", scanned_by: null, logged_at: now() }),
  admin_users: () => ({ id: uuid(), role: "staff", is_active: true, created_at: now(), updated_at: now() }),
  invitation_codes: () => ({ id: uuid(), created_at: now(), updated_at: now() }),
  exhibitors: () => ({ id: uuid(), contact_name: null, contact_email: null, booth_number: null, is_active: true, created_at: now(), updated_at: now() }),
  exhibitor_leads: () => ({ id: uuid(), note: null, scanned_at: now(), updated_at: now() }),
};

// 一意制約（Postgres 23505 を模倣）
const UNIQUE_CHECKS = {
  visitors: (row, rows) =>
    rows.some((r) => r.email?.toLowerCase() === row.email?.toLowerCase())
      ? "visitors_email_lower_key"
      : null,
  registrations: (row, rows) => {
    if (rows.some((r) => r.exhibition_id === row.exhibition_id && r.visitor_id === row.visitor_id))
      return "registrations_exhibition_id_visitor_id_key";
    if (rows.some((r) => r.ticket_code === row.ticket_code))
      return "registrations_ticket_code_key";
    return null;
  },
  seminar_bookings: (row, rows) =>
    rows.some((r) => r.seminar_id === row.seminar_id && r.registration_id === row.registration_id)
      ? "seminar_bookings_seminar_id_registration_id_key"
      : null,
  admin_users: (row, rows) =>
    rows.some((r) => r.auth_user_id === row.auth_user_id)
      ? "admin_users_auth_user_id_key"
      : null,
  exhibitors: (row, rows) =>
    rows.some((r) => r.access_code === row.access_code)
      ? "exhibitors_access_code_key"
      : null,
  exhibitor_leads: (row, rows) =>
    rows.some((r) => r.exhibitor_id === row.exhibitor_id && r.registration_id === row.registration_id)
      ? "exhibitor_leads_exhibitor_id_registration_id_key"
      : null,
};

// ---------- ビュー（読み取り時に計算） ----------
function computeViews(name) {
  if (name === "v_exhibition_stats") {
    return db.exhibitions.map((e) => {
      const regs = db.registrations.filter((r) => r.exhibition_id === e.id);
      const regIds = new Set(regs.map((r) => r.id));
      return {
        exhibition_id: e.id,
        exhibition_name: e.name,
        slug: e.slug,
        start_date: e.start_date,
        end_date: e.end_date,
        status: e.status,
        confirmed_count: regs.filter((r) => r.status === "confirmed").length,
        cancelled_count: regs.filter((r) => r.status === "cancelled").length,
        entry_count: db.entry_logs.filter((l) => regIds.has(l.registration_id) && l.action === "entry").length,
        max_registrations: e.max_registrations,
      };
    });
  }
  if (name === "v_seminar_stats") {
    return db.seminars.map((s) => {
      const bookings = db.seminar_bookings.filter((b) => b.seminar_id === s.id);
      return {
        seminar_id: s.id,
        exhibition_id: s.exhibition_id,
        title: s.title,
        capacity: s.capacity,
        starts_at: s.starts_at,
        ends_at: s.ends_at,
        confirmed_count: bookings.filter((b) => b.status === "confirmed").length,
        waitlisted_count: bookings.filter((b) => b.status === "waitlisted").length,
        checked_in_count: bookings.filter((b) => b.checked_in_at != null).length,
      };
    });
  }
  return null;
}

function getRows(table) {
  const view = computeViews(table);
  if (view) return view;
  if (!db[table]) throw Object.assign(new Error(`relation "${table}" does not exist`), { pgCode: "42P01" });
  return db[table];
}

// ---------- select パーサー ----------
function splitTop(s, sep = ",") {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === sep && depth === 0) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

function parseSelect(sel) {
  if (!sel) sel = "*";
  return splitTop(sel).map((item) => {
    const m = item.match(/^(?:([\w]+):)?([\w]+)(!\w+)?\((.*)\)$/s);
    if (m) {
      return {
        type: "embed",
        alias: m[1] || m[2],
        table: m[2],
        inner: m[3] === "!inner",
        cols: parseSelect(m[4] || "*"),
      };
    }
    return { type: "col", name: item };
  });
}

// ---------- フィルター評価 ----------
function coerce(v) {
  if (v === "null") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  return v;
}

function likeToRegex(pattern) {
  // PostgREST は * も % として扱う。\\% \\_ はリテラル
  const escRe = /[.*+?^${}()|[\]\\]/g;
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "\\" && i + 1 < pattern.length) {
      out += pattern[++i].replace(escRe, "\\$&");
    } else if (ch === "%" || ch === "*") {
      out += ".*";
    } else if (ch === "_") {
      out += ".";
    } else {
      out += ch.replace(escRe, "\\$&");
    }
  }
  return new RegExp(`^${out}$`, "si");
}

function evalCond(row, col, op, rawVal) {
  const val = row[col];
  switch (op) {
    case "eq": {
      const target = coerce(rawVal);
      if (typeof val === "number") return val === Number(target);
      if (typeof val === "boolean") return val === target;
      return String(val) === String(target);
    }
    case "neq": {
      const target = coerce(rawVal);
      return String(val) !== String(target);
    }
    case "gt": return compare(val, rawVal) > 0;
    case "gte": return compare(val, rawVal) >= 0;
    case "lt": return compare(val, rawVal) < 0;
    case "lte": return compare(val, rawVal) <= 0;
    case "like":
    case "ilike":
      return typeof val === "string" && likeToRegex(rawVal).test(val);
    case "is": {
      const target = coerce(rawVal);
      if (target === null) return val == null;
      return val === target;
    }
    case "in": {
      const list = splitTop(rawVal.replace(/^\(/, "").replace(/\)$/, "")).map((x) =>
        x.replace(/^"(.*)"$/, "$1"),
      );
      return list.some((x) => String(x) === String(val));
    }
    default:
      return true;
  }
}

const DATEISH = /^\d{4}-\d{2}-\d{2}[T ]/;

function compare(a, b) {
  if (a == null) return -1;
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  // タイムゾーン表記が違う日時同士（+09:00 vs Z）は文字列比較できないため時刻で比較
  if (
    typeof a === "string" &&
    typeof b === "string" &&
    DATEISH.test(a) &&
    DATEISH.test(b)
  ) {
    const ta = Date.parse(a);
    const tb = Date.parse(b);
    if (!Number.isNaN(ta) && !Number.isNaN(tb)) return ta - tb;
  }
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

function parseCond(cond) {
  // col.op.value（valueに . が含まれ得るので op を先に確定）
  const m = cond.match(/^([\w]+)\.(eq|neq|gt|gte|lt|lte|like|ilike|is|in|not)\.(.*)$/s);
  if (!m) return null;
  if (m[2] === "not") {
    const inner = parseCond(`${m[1]}.${m[3]}`);
    return inner ? { ...inner, negate: true } : null;
  }
  return { col: m[1], op: m[2], val: m[3], negate: false };
}

function evalParsedCond(row, c) {
  const r = evalCond(row, c.col, c.op, c.val);
  return c.negate ? !r : r;
}

function evalOr(row, orVal) {
  const inner = orVal.replace(/^\(/, "").replace(/\)$/, "");
  return splitTop(inner).some((cond) => {
    if (cond.startsWith("and(")) {
      const conds = splitTop(cond.slice(4, -1));
      return conds.every((c) => {
        const p = parseCond(c);
        return p ? evalParsedCond(row, p) : true;
      });
    }
    const p = parseCond(cond);
    return p ? evalParsedCond(row, p) : true;
  });
}

// ---------- 埋め込みリソース解決 ----------
function findRelation(parentTable, embedTable) {
  // 子→親（to-one）: parentTable にembedTableを参照する列がある
  const toOne = FOREIGN_KEYS.find(
    (fk) => fk.table === parentTable && fk.references === embedTable,
  );
  if (toOne) return { kind: "toOne", column: toOne.column };
  // 親→子（to-many）: embedTable に parentTable を参照する列がある
  const toMany = FOREIGN_KEYS.find(
    (fk) => fk.table === embedTable && fk.references === parentTable,
  );
  if (toMany) return { kind: "toMany", column: toMany.column };
  return null;
}

function projectRow(row, cols, table, embedFilters, embedOrders) {
  const out = {};
  for (const c of cols) {
    if (c.type === "col") {
      if (c.name === "*") Object.assign(out, row);
      else if (c.name in row) out[c.name] = row[c.name];
      continue;
    }
    // embed
    const rel = findRelation(table, c.table);
    if (!rel) {
      out[c.alias] = null;
      continue;
    }
    const childFilters = embedFilters.filter(
      (f) => f.path === c.alias || f.path === c.table,
    );
    if (rel.kind === "toOne") {
      const target = getRows(c.table).find((r) => r.id === row[rel.column]);
      let obj = target
        ? projectRow(target, c.cols, c.table, stripPath(childFilters), [])
        : null;
      if (obj && childFilters.length > 0) {
        const raw = getRows(c.table).find((r) => r.id === row[rel.column]);
        if (!matchesFilters(raw, childFilters.map(dropPath))) obj = null;
      }
      out[c.alias] = obj;
      if (obj === null && c.inner) out.__drop = true;
    } else {
      let children = getRows(c.table).filter((r) => r[rel.column] === row.id);
      if (childFilters.length > 0) {
        children = children.filter((r) => matchesFilters(r, childFilters.map(dropPath)));
      }
      const orders = embedOrders.filter((o) => o.path === c.alias || o.path === c.table);
      for (const o of orders.reverse()) sortRows(children, o.col, o.asc);
      out[c.alias] = children.map((r) => projectRow(r, c.cols, c.table, [], []));
      if (c.inner && out[c.alias].length === 0) out.__drop = true;
    }
  }
  return out;
}

function stripPath(filters) {
  return [];
}
function dropPath(f) {
  return { ...f, path: null };
}

function matchesFilters(row, filters) {
  return filters.every((f) => {
    if (f.kind === "or") return evalOr(row, f.val);
    return evalParsedCond(row, f);
  });
}

function sortRows(rows, col, asc) {
  rows.sort((a, b) => (asc ? compare(a[col], b[col]) : compare(b[col], a[col])));
}

// ---------- PostgREST リクエスト処理 ----------
const RESERVED_PARAMS = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function parseQuery(searchParams) {
  const filters = []; // {path|null, kind:'cond'|'or', ...}
  const orders = []; // {path|null, col, asc}
  let limit = null;
  let offset = 0;

  for (const [key, value] of searchParams.entries()) {
    if (key === "select" || key === "on_conflict" || key === "columns") continue;
    if (key === "limit") { limit = Number(value); continue; }
    if (key === "offset") { offset = Number(value); continue; }
    if (key === "order" || key.endsWith(".order")) {
      const path = key === "order" ? null : key.slice(0, -".order".length);
      for (const part of value.split(",")) {
        const bits = part.split(".");
        orders.push({ path, col: bits[0], asc: !bits.includes("desc") });
      }
      continue;
    }
    if (key === "or" || key.endsWith(".or")) {
      const path = key === "or" ? null : key.slice(0, -".or".length);
      filters.push({ path, kind: "or", val: value });
      continue;
    }
    if (RESERVED_PARAMS.has(key)) continue;
    // col=op.value（埋め込みは path.col=op.value）
    const dotIdx = key.lastIndexOf(".");
    let path = null;
    let col = key;
    if (dotIdx > 0) {
      path = key.slice(0, dotIdx);
      col = key.slice(dotIdx + 1);
    }
    const m = value.match(/^(eq|neq|gt|gte|lt|lte|like|ilike|is|in|not)\.(.*)$/s);
    if (!m) continue;
    if (m[1] === "not") {
      const mm = m[2].match(/^(eq|neq|gt|gte|lt|lte|like|ilike|is|in)\.(.*)$/s);
      if (mm) filters.push({ path, kind: "cond", col, op: mm[1], val: mm[2], negate: true });
      continue;
    }
    filters.push({ path, kind: "cond", col, op: m[1], val: m[2], negate: false });
  }
  return { filters, orders, limit, offset };
}

function handleRest(req, res, url, body) {
  const table = url.pathname.replace(/^\/rest\/v1\//, "");
  const accept = req.headers.accept || "";
  const prefer = req.headers.prefer || "";
  const wantsObject = accept.includes("vnd.pgrst.object+json");
  const wantsCount = prefer.includes("count=exact");
  const wantsRepresentation = prefer.includes("return=representation");

  // RPC
  if (table.startsWith("rpc/")) {
    const fn = table.slice(4);
    if (fn === "generate_ticket_code") {
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let code = "";
      for (let i = 0; i < 8; i++) code += chars[crypto.randomInt(chars.length)];
      return sendJson(res, 200, code);
    }
    return sendJson(res, 404, { code: "42883", message: `function ${fn} does not exist` });
  }

  let rows;
  try {
    rows = getRows(table);
  } catch (e) {
    return sendJson(res, 404, { code: e.pgCode || "42P01", message: e.message });
  }

  const { filters, orders, limit, offset } = parseQuery(url.searchParams);
  const rootFilters = filters.filter((f) => f.path === null);
  const embedFilters = filters.filter((f) => f.path !== null);
  const rootOrders = orders.filter((o) => o.path === null);
  const embedOrders = orders.filter((o) => o.path !== null);
  const selectCols = parseSelect(url.searchParams.get("select"));

  if (req.method === "GET" || req.method === "HEAD") {
    let result = rows.filter((r) => matchesFilters(r, rootFilters));
    // 埋め込み＋!inner/埋め込みフィルタによる絞り込み
    let projected = result.map((r) => projectRow(r, selectCols, table, embedFilters, embedOrders));
    const keep = projected.map((p) => !p.__drop);
    result = result.filter((_, i) => keep[i]);
    projected = projected.filter((_, i) => keep[i]).map((p) => { delete p.__drop; return p; });

    // ソート（安定させるため逆順に適用）
    const zipped = projected.map((p, i) => ({ p, raw: result[i] }));
    for (const o of [...rootOrders].reverse()) {
      zipped.sort((a, b) => {
        const av = a.raw[o.col] ?? a.p[o.col];
        const bv = b.raw[o.col] ?? b.p[o.col];
        return o.asc ? compare(av, bv) : compare(bv, av);
      });
    }
    let final = zipped.map((z) => z.p);

    const total = final.length;
    if (offset || limit != null) {
      final = final.slice(offset, limit != null ? offset + limit : undefined);
    }

    const headers = {};
    if (wantsCount) {
      const from = offset;
      const to = offset + Math.max(final.length - 1, 0);
      headers["Content-Range"] = `${total === 0 ? "*" : `${from}-${to}`}/${total}`;
    }
    if (req.method === "HEAD") return sendJson(res, 200, null, headers);
    if (wantsObject) {
      if (final.length !== 1) {
        return sendJson(res, 406, {
          code: "PGRST116",
          message: "JSON object requested, multiple (or no) rows returned",
          details: `Results contain ${final.length} rows`,
          hint: null,
        }, headers);
      }
      return sendJson(res, 200, final[0], headers);
    }
    return sendJson(res, 200, final, headers);
  }

  if (req.method === "POST") {
    const view = computeViews(table);
    if (view) return sendJson(res, 405, { message: "cannot insert into view" });
    const inputs = Array.isArray(body) ? body : [body];
    const inserted = [];
    for (const input of inputs) {
      const defaults = (ROW_DEFAULTS[table] || (() => ({ id: uuid() })))();
      const row = { ...defaults, ...input };
      const uniqueErr = UNIQUE_CHECKS[table]?.(row, db[table]);
      if (uniqueErr) {
        return sendJson(res, 409, {
          code: "23505",
          message: `duplicate key value violates unique constraint "${uniqueErr}"`,
          details: null,
          hint: null,
        });
      }
      db[table].push(row);
      inserted.push(row);
    }
    if (!wantsRepresentation) return sendJson(res, 201, null);
    const projected = inserted.map((r) => projectRow(r, selectCols, table, [], []));
    if (wantsObject) {
      if (projected.length !== 1) {
        return sendJson(res, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
      }
      return sendJson(res, 201, projected[0]);
    }
    return sendJson(res, 201, projected);
  }

  if (req.method === "PATCH") {
    const view = computeViews(table);
    if (view) return sendJson(res, 405, { message: "cannot update view" });
    const targets = db[table].filter((r) => matchesFilters(r, rootFilters));
    for (const t of targets) {
      Object.assign(t, body);
      if ("updated_at" in t) t.updated_at = now();
    }
    if (!wantsRepresentation) return sendJson(res, 204, null);
    const projected = targets.map((r) => projectRow(r, selectCols, table, [], []));
    if (wantsObject) {
      if (projected.length !== 1) {
        return sendJson(res, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `Results contain ${projected.length} rows` });
      }
      return sendJson(res, 200, projected[0]);
    }
    return sendJson(res, 200, projected);
  }

  if (req.method === "DELETE") {
    const remaining = db[table].filter((r) => !matchesFilters(r, rootFilters));
    const removed = db[table].filter((r) => matchesFilters(r, rootFilters));
    db[table] = remaining;
    if (!wantsRepresentation) return sendJson(res, 204, null);
    return sendJson(res, 200, removed);
  }

  return sendJson(res, 405, { message: "method not allowed" });
}

// ---------- Auth 処理 ----------
function handleAuth(req, res, url, body) {
  if (url.pathname === "/auth/v1/token" && req.method === "POST") {
    const grant = url.searchParams.get("grant_type");
    if (grant === "password") {
      const user = AUTH_USERS.find(
        (u) => u.email === (body?.email || "").toLowerCase() && u.password === body?.password,
      );
      if (!user) {
        return sendJson(res, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
      }
      return sendJson(res, 200, issueSession(user));
    }
    if (grant === "refresh_token") {
      const userId = refreshTokens.get(body?.refresh_token);
      if (!userId) {
        return sendJson(res, 400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
      }
      refreshTokens.delete(body.refresh_token);
      const user = AUTH_USERS.find((u) => u.id === userId);
      return sendJson(res, 200, issueSession(user));
    }
    return sendJson(res, 400, { code: 400, msg: `unsupported grant_type ${grant}` });
  }

  if (url.pathname === "/auth/v1/user" && req.method === "GET") {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const entry = accessTokens.get(token);
    if (!entry || entry.exp < Date.now()) {
      return sendJson(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
    }
    const user = AUTH_USERS.find((u) => u.id === entry.userId);
    return sendJson(res, 200, publicUser(user));
  }

  if (url.pathname === "/auth/v1/logout" && req.method === "POST") {
    return sendJson(res, 204, null);
  }

  return sendJson(res, 404, { code: 404, msg: "not found" });
}

// ---------- HTTP サーバー ----------
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS, HEAD",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, prefer, accept, accept-profile, content-profile, x-client-info, x-supabase-api-version, range, range-unit",
  "Access-Control-Expose-Headers": "Content-Range",
};

function sendJson(res, status, data, extraHeaders = {}) {
  const headers = { ...CORS_HEADERS, "Content-Type": "application/json", ...extraHeaders };
  res.writeHead(status, headers);
  if (data === null || data === undefined) return res.end();
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    return res.end();
  }

  let body = null;
  if (req.method === "POST" || req.method === "PATCH" || req.method === "PUT") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = null;
    }
  }

  try {
    if (url.pathname.startsWith("/auth/v1/")) return handleAuth(req, res, url, body);
    if (url.pathname.startsWith("/rest/v1/")) return handleRest(req, res, url, body);
    if (url.pathname === "/") return sendJson(res, 200, { ok: true, mock: "supabase" });
    return sendJson(res, 404, { message: "not found" });
  } catch (err) {
    console.error("[mock-supabase] error:", err);
    return sendJson(res, 500, { message: String(err?.message || err) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[mock-supabase] listening on http://127.0.0.1:${PORT}`);
  console.log(`[mock-supabase] admin login: admin@dosl.dev / devpass123`);
  console.log(`[mock-supabase] seeded tickets: TEST1234, TEST5678 (両者とも基調講演を予約済み)`);
});
