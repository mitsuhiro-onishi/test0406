// CSV出力の共通ヘルパー（Excel数式インジェクション対策込み）

/** セル値のエスケープ。= + - @ 始まりはシングルクォート前置で数式評価を防ぐ */
export function csvEscape(val: string | number | null | undefined): string {
  if (val == null) return "";
  let s = String(val);
  if (/^[=+\-@]/.test(s)) {
    s = `'${s}`;
  }
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** ヘッダー行＋データ行から BOM 付き CSV 文字列を組み立てる */
export function buildCsv(
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
): string {
  const bom = "\uFEFF";
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((r) => r.map(csvEscape).join(",")),
  ];
  return bom + lines.join("\n");
}

/** JST基準の YYYY-MM-DD（CSVファイル名用） */
export function jstDateString(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(
    new Date(),
  );
}

/** タイムスタンプのJST表示（CSVセル用） */
export function jstDateTime(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}
