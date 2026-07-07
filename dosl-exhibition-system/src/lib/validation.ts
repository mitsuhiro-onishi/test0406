// サーバー側入力バリデーション（要件定義書 4.1 / 4.2 準拠）

export const MAX_LEN = {
  email: 254,
  last_name: 50,
  first_name: 50,
  last_name_kana: 50,
  first_name_kana: 50,
  company_name: 100,
  company_kana: 100,
  department: 100,
  position: 100,
  phone: 20,
  postal_code: 8,
  address: 200,
  industry: 50,
  gate: 50,
  password: 128,
  seminar_title: 200,
  seminar_description: 2000,
  speaker_name: 100,
  speaker_title: 100,
  venue_name: 100,
  exhibitor_name: 100,
  booth_number: 20,
  contact_name: 50,
  contact_email: 254,
  lead_note: 500,
} as const;

/** 文字列なら前後空白と制御文字を除去して返す。文字列以外・空文字は null */
export function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const s = value.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  return s.length > 0 ? s : null;
}

export function isValidEmail(email: string): boolean {
  if (email.length < 5 || email.length > MAX_LEN.email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * カナ項目の正規化。
 * NFKC正規化（半角カナ→全角）＋ひらがな→カタカナ変換の上、
 * 全角カタカナ・長音・中点・空白のみなら正規化結果を返す。それ以外は null。
 */
export function normalizeKana(value: string): string | null {
  const nfkc = value.normalize("NFKC");
  const katakana = nfkc.replace(/[ぁ-ゖ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) + 0x60),
  );
  return /^[ァ-ヺー・\s]+$/.test(katakana) ? katakana : null;
}

/** 電話番号: 半角数字・ハイフンのみ（NFKCで全角数字は吸収）、20文字以内 */
export function normalizePhone(value: string): string | null {
  const s = value.normalize("NFKC").replace(/\s/g, "");
  return /^[0-9\-]{1,20}$/.test(s) ? s : null;
}

/** 郵便番号: XXX-XXXX（ハイフン有無両対応）。ハイフン付きに正規化 */
export function normalizePostalCode(value: string): string | null {
  const s = value.normalize("NFKC").replace(/\s/g, "");
  const m = s.match(/^(\d{3})-?(\d{4})$/);
  return m ? `${m[1]}-${m[2]}` : null;
}

export function isValidTicketCode(code: string): boolean {
  return /^[A-Z0-9]{8}$/.test(code);
}

/** UUID形式チェック（不正値をDBに渡すと実Postgresでは22P02になるため事前検証） */
export function isValidUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

export const REGISTRATION_STATUSES = [
  "confirmed",
  "cancelled",
  "waitlisted",
] as const;

export const CHECKIN_METHODS = ["qr", "manual"] as const;

export const SEMINAR_STATUSES = [
  "draft",
  "open",
  "closed",
  "cancelled",
] as const;

export interface FieldError {
  field: string;
  message: string;
}

interface VisitorFieldInput {
  last_name?: unknown;
  first_name?: unknown;
  last_name_kana?: unknown;
  first_name_kana?: unknown;
  company_name?: unknown;
  company_kana?: unknown;
  department?: unknown;
  position?: unknown;
  phone?: unknown;
  postal_code?: unknown;
  address?: unknown;
}

const FIELD_LABELS: Record<string, string> = {
  email: "メールアドレス",
  last_name: "姓",
  first_name: "名",
  last_name_kana: "セイ",
  first_name_kana: "メイ",
  company_name: "会社名",
  company_kana: "会社名（カナ）",
  department: "部署",
  position: "役職",
  phone: "電話番号",
  postal_code: "郵便番号",
  address: "住所",
  industry: "業種",
  visit_purpose: "来場目的",
};

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] || field;
}

/**
 * 来場者フィールド群を検証・正規化する。
 * 戻り値 values には検証済みの値のみ入る（undefined = 入力なし）。
 */
export function validateVisitorFields(input: VisitorFieldInput): {
  values: Record<string, string | null>;
  errors: FieldError[];
} {
  const values: Record<string, string | null> = {};
  const errors: FieldError[] = [];

  const textFields: Array<
    [keyof VisitorFieldInput, number]
  > = [
    ["last_name", MAX_LEN.last_name],
    ["first_name", MAX_LEN.first_name],
    ["company_name", MAX_LEN.company_name],
    ["department", MAX_LEN.department],
    ["position", MAX_LEN.position],
    ["address", MAX_LEN.address],
  ];
  for (const [field, max] of textFields) {
    if (input[field] === undefined) continue;
    const v = cleanText(input[field]);
    if (v === null) {
      values[field] = null;
      continue;
    }
    if (v.length > max) {
      errors.push({
        field,
        message: `${fieldLabel(field)}は${max}文字以内で入力してください`,
      });
      continue;
    }
    values[field] = v;
  }

  const kanaFields: Array<[keyof VisitorFieldInput, number]> = [
    ["last_name_kana", MAX_LEN.last_name_kana],
    ["first_name_kana", MAX_LEN.first_name_kana],
    ["company_kana", MAX_LEN.company_kana],
  ];
  for (const [field, max] of kanaFields) {
    if (input[field] === undefined) continue;
    const v = cleanText(input[field]);
    if (v === null) {
      values[field] = null;
      continue;
    }
    const kana = normalizeKana(v);
    if (kana === null) {
      errors.push({
        field,
        message: `${fieldLabel(field)}はカタカナで入力してください`,
      });
      continue;
    }
    if (kana.length > max) {
      errors.push({
        field,
        message: `${fieldLabel(field)}は${max}文字以内で入力してください`,
      });
      continue;
    }
    values[field] = kana;
  }

  if (input.phone !== undefined) {
    const v = cleanText(input.phone);
    if (v === null) {
      values.phone = null;
    } else {
      const phone = normalizePhone(v);
      if (phone === null) {
        errors.push({
          field: "phone",
          message: "電話番号は半角数字とハイフンで入力してください（例: 03-1234-5678）",
        });
      } else {
        values.phone = phone;
      }
    }
  }

  if (input.postal_code !== undefined) {
    const v = cleanText(input.postal_code);
    if (v === null) {
      values.postal_code = null;
    } else {
      const postal = normalizePostalCode(v);
      if (postal === null) {
        errors.push({
          field: "postal_code",
          message: "郵便番号はXXX-XXXXの形式で入力してください",
        });
      } else {
        values.postal_code = postal;
      }
    }
  }

  return { values, errors };
}

export interface CompanionInput {
  name: string;
  name_kana?: string;
  company?: string;
}

/**
 * 同伴者配列を検証・正規化する（JSONB構造検証を兼ねる）。
 * 不正なら errors、正常なら未知キーを落とした配列を返す。
 */
export function validateCompanions(
  input: unknown,
  maxCount: number,
): { companions: CompanionInput[]; errors: FieldError[] } {
  const errors: FieldError[] = [];
  if (input === undefined || input === null) {
    return { companions: [], errors };
  }
  if (!Array.isArray(input)) {
    errors.push({ field: "companions", message: "同伴者の形式が不正です" });
    return { companions: [], errors };
  }
  if (input.length > maxCount) {
    errors.push({
      field: "companions",
      message: `同伴者は${maxCount}名までです`,
    });
    return { companions: [], errors };
  }

  const companions: CompanionInput[] = [];
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (typeof c !== "object" || c === null) {
      errors.push({ field: "companions", message: "同伴者の形式が不正です" });
      return { companions: [], errors };
    }
    const name = cleanText((c as Record<string, unknown>).name);
    if (name === null) {
      errors.push({
        field: "companions",
        message: `同伴者${i + 1}の氏名を入力してください`,
      });
      continue;
    }
    if (name.length > 50) {
      errors.push({
        field: "companions",
        message: `同伴者${i + 1}の氏名は50文字以内で入力してください`,
      });
      continue;
    }
    const companion: CompanionInput = { name };

    const rawKana = (c as Record<string, unknown>).name_kana;
    if (rawKana !== undefined) {
      const v = cleanText(rawKana);
      if (v !== null) {
        const kana = normalizeKana(v);
        if (kana === null || kana.length > 50) {
          errors.push({
            field: "companions",
            message: `同伴者${i + 1}のカナはカタカナ50文字以内で入力してください`,
          });
          continue;
        }
        companion.name_kana = kana;
      }
    }

    const rawCompany = (c as Record<string, unknown>).company;
    if (rawCompany !== undefined) {
      const v = cleanText(rawCompany);
      if (v !== null) {
        if (v.length > 100) {
          errors.push({
            field: "companions",
            message: `同伴者${i + 1}の会社名は100文字以内で入力してください`,
          });
          continue;
        }
        companion.company = v;
      }
    }

    companions.push(companion);
  }

  return { companions, errors };
}

/** HTMLエスケープ（メールテンプレート用） */
export function escapeHtml(value: unknown): string {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** CSSカラー値の検証（#hex のみ許可、それ以外はフォールバック） */
export function safeCssColor(value: unknown, fallback: string): string {
  if (typeof value === "string" && /^#[0-9a-fA-F]{3,8}$/.test(value)) {
    return value;
  }
  return fallback;
}

/**
 * PostgREST の or()/ilike フィルタに埋め込む検索語のサニタイズ。
 * 構文区切り文字を除去し、LIKEワイルドカードをエスケープする。
 */
export function sanitizeSearchTerm(q: string): string {
  return q
    .replace(/[,()."']/g, " ")
    .replace(/([\\%_])/g, "\\$1")
    .trim();
}

// ============================================================
// セミナー管理（GATEオプション）
// ============================================================

interface SeminarFieldInput {
  title?: unknown;
  description?: unknown;
  speaker_name?: unknown;
  speaker_title?: unknown;
  venue_name?: unknown;
  capacity?: unknown;
  starts_at?: unknown;
  ends_at?: unknown;
  status?: unknown;
  sort_order?: unknown;
}

const SEMINAR_FIELD_LABELS: Record<string, string> = {
  title: "タイトル",
  description: "説明",
  speaker_name: "講演者名",
  speaker_title: "講演者肩書",
  venue_name: "会場名",
  capacity: "定員",
  starts_at: "開始日時",
  ends_at: "終了日時",
  status: "ステータス",
  sort_order: "表示順",
};

function seminarFieldLabel(field: string): string {
  return SEMINAR_FIELD_LABELS[field] || field;
}

/** ISO8601等の日時文字列を検証し、ISO文字列に正規化。不正は null */
export function normalizeDateTime(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const d = new Date(value.trim());
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * セミナーの入力フィールド群を検証・正規化する。
 * partial=true（PATCH用）では未指定フィールドを無視、
 * partial=false（作成用）では title / starts_at / ends_at を必須とする。
 * 開始・終了の前後関係は両方が確定している場合のみ検証する
 * （PATCHで片方だけ更新する場合は呼び出し側で既存値とマージして渡すこと）。
 */
export function validateSeminarFields(
  input: SeminarFieldInput,
  options: { partial: boolean },
): {
  values: Record<string, string | number | null>;
  errors: FieldError[];
} {
  const values: Record<string, string | number | null> = {};
  const errors: FieldError[] = [];
  const { partial } = options;

  // title（作成時は必須）
  if (input.title !== undefined || !partial) {
    const v = cleanText(input.title);
    if (v === null) {
      errors.push({ field: "title", message: "タイトルを入力してください" });
    } else if (v.length > MAX_LEN.seminar_title) {
      errors.push({
        field: "title",
        message: `タイトルは${MAX_LEN.seminar_title}文字以内で入力してください`,
      });
    } else {
      values.title = v;
    }
  }

  // 任意テキスト
  const textFields: Array<[keyof SeminarFieldInput, number]> = [
    ["description", MAX_LEN.seminar_description],
    ["speaker_name", MAX_LEN.speaker_name],
    ["speaker_title", MAX_LEN.speaker_title],
    ["venue_name", MAX_LEN.venue_name],
  ];
  for (const [field, max] of textFields) {
    if (input[field] === undefined) continue;
    const v = cleanText(input[field]);
    if (v === null) {
      values[field] = null;
      continue;
    }
    if (v.length > max) {
      errors.push({
        field,
        message: `${seminarFieldLabel(field)}は${max}文字以内で入力してください`,
      });
      continue;
    }
    values[field] = v;
  }

  // 定員: null（無制限）または 1〜100000 の整数
  if (input.capacity !== undefined) {
    const raw = input.capacity;
    if (raw === null || raw === "") {
      values.capacity = null;
    } else {
      const n =
        typeof raw === "number" ? raw : Number(cleanText(raw) ?? NaN);
      if (!Number.isInteger(n) || n < 1 || n > 100000) {
        errors.push({
          field: "capacity",
          message: "定員は1以上の整数で入力してください（無制限は空欄）",
        });
      } else {
        values.capacity = n;
      }
    }
  }

  // 日時（作成時は必須）
  for (const field of ["starts_at", "ends_at"] as const) {
    if (input[field] === undefined && partial) continue;
    const iso = normalizeDateTime(input[field]);
    if (iso === null) {
      errors.push({
        field,
        message: `${seminarFieldLabel(field)}を正しく入力してください`,
      });
    } else {
      values[field] = iso;
    }
  }
  if (
    typeof values.starts_at === "string" &&
    typeof values.ends_at === "string" &&
    values.ends_at <= values.starts_at
  ) {
    errors.push({
      field: "ends_at",
      message: "終了日時は開始日時より後にしてください",
    });
  }

  // ステータス
  if (input.status !== undefined) {
    const v = cleanText(input.status);
    if (!v || !(SEMINAR_STATUSES as readonly string[]).includes(v)) {
      errors.push({ field: "status", message: "ステータスの値が不正です" });
    } else {
      values.status = v;
    }
  }

  // 表示順
  if (input.sort_order !== undefined) {
    const raw = input.sort_order;
    const n = typeof raw === "number" ? raw : Number(cleanText(raw) ?? NaN);
    if (!Number.isInteger(n) || n < 0 || n > 10000) {
      errors.push({
        field: "sort_order",
        message: "表示順は0以上の整数で入力してください",
      });
    } else {
      values.sort_order = n;
    }
  }

  return { values, errors };
}

// ============================================================
// リードリトリーバル（GATEオプション）
// ============================================================

/** 出展社アクセスコード: 12文字の大文字英数字 */
export function isValidAccessCode(code: unknown): code is string {
  return typeof code === "string" && /^[A-Z0-9]{12}$/.test(code);
}

interface ExhibitorFieldInput {
  name?: unknown;
  booth_number?: unknown;
  contact_name?: unknown;
  contact_email?: unknown;
  is_active?: unknown;
}

const EXHIBITOR_FIELD_LABELS: Record<string, string> = {
  name: "出展社名",
  booth_number: "ブース番号",
  contact_name: "担当者名",
  contact_email: "担当者メール",
};

/**
 * 出展社の入力フィールド群を検証・正規化する。
 * partial=true（PATCH用）では未指定フィールドを無視、
 * partial=false（作成用）では name を必須とする。
 */
export function validateExhibitorFields(
  input: ExhibitorFieldInput,
  options: { partial: boolean },
): {
  values: Record<string, string | boolean | null>;
  errors: FieldError[];
} {
  const values: Record<string, string | boolean | null> = {};
  const errors: FieldError[] = [];
  const { partial } = options;

  if (input.name !== undefined || !partial) {
    const v = cleanText(input.name);
    if (v === null) {
      errors.push({ field: "name", message: "出展社名を入力してください" });
    } else if (v.length > MAX_LEN.exhibitor_name) {
      errors.push({
        field: "name",
        message: `出展社名は${MAX_LEN.exhibitor_name}文字以内で入力してください`,
      });
    } else {
      values.name = v;
    }
  }

  const textFields: Array<[keyof ExhibitorFieldInput, number]> = [
    ["booth_number", MAX_LEN.booth_number],
    ["contact_name", MAX_LEN.contact_name],
  ];
  for (const [field, max] of textFields) {
    if (input[field] === undefined) continue;
    const v = cleanText(input[field]);
    if (v === null) {
      values[field] = null;
      continue;
    }
    if (v.length > max) {
      errors.push({
        field,
        message: `${EXHIBITOR_FIELD_LABELS[field]}は${max}文字以内で入力してください`,
      });
      continue;
    }
    values[field] = v;
  }

  if (input.contact_email !== undefined) {
    const v = cleanText(input.contact_email);
    if (v === null) {
      values.contact_email = null;
    } else if (!isValidEmail(v.toLowerCase())) {
      errors.push({
        field: "contact_email",
        message: "担当者メールの形式が正しくありません",
      });
    } else {
      values.contact_email = v.toLowerCase();
    }
  }

  if (input.is_active !== undefined) {
    if (typeof input.is_active !== "boolean") {
      errors.push({ field: "is_active", message: "is_active の値が不正です" });
    } else {
      values.is_active = input.is_active;
    }
  }

  return { values, errors };
}

/** リードの商談メモ: 500文字以内。空はnull */
export function validateLeadNote(input: unknown): {
  value: string | null;
  error: FieldError | null;
} {
  const v = cleanText(input);
  if (v === null) return { value: null, error: null };
  if (v.length > MAX_LEN.lead_note) {
    return {
      value: null,
      error: {
        field: "note",
        message: `メモは${MAX_LEN.lead_note}文字以内で入力してください`,
      },
    };
  }
  return { value: v, error: null };
}
