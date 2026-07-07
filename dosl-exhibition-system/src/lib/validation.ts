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

export const REGISTRATION_STATUSES = [
  "confirmed",
  "cancelled",
  "waitlisted",
] as const;

export const CHECKIN_METHODS = ["qr", "manual"] as const;

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
