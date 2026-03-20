import { supabaseAdmin } from "@/lib/supabase/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function RegistrationsPage({
  searchParams,
}: {
  searchParams: { exhibition_id?: string; status?: string; q?: string };
}) {
  // 展示会一覧（フィルター用）
  const { data: exhibitions } = await supabaseAdmin
    .from("exhibitions")
    .select("id, name, slug")
    .order("start_date", { ascending: false });

  // 登録者一覧クエリ
  let query = supabaseAdmin
    .from("registrations")
    .select(
      `
      *,
      visitor:visitors(*),
      exhibition:exhibitions(id, name, slug),
      registration_type:registration_types(name, color)
    `,
    )
    .order("registered_at", { ascending: false })
    .limit(100);

  if (searchParams.exhibition_id) {
    query = query.eq("exhibition_id", searchParams.exhibition_id);
  }
  if (searchParams.status) {
    query = query.eq("status", searchParams.status);
  }

  const { data: registrations } = await query;

  // 簡易的なテキスト検索（visitor名 or 会社名）
  let filtered = registrations || [];
  if (searchParams.q) {
    const q = searchParams.q.toLowerCase();
    filtered = filtered.filter(
      (r) =>
        r.visitor?.last_name?.toLowerCase().includes(q) ||
        r.visitor?.first_name?.toLowerCase().includes(q) ||
        r.visitor?.company_name?.toLowerCase().includes(q) ||
        r.visitor?.email?.toLowerCase().includes(q) ||
        r.ticket_code?.toLowerCase().includes(q),
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">登録者一覧</h1>
        <span className="text-sm text-gray-500">{filtered.length}件</span>
      </div>

      {/* フィルター */}
      <form className="bg-white rounded-xl shadow-sm p-4 mb-6 flex flex-wrap gap-4">
        <select
          name="exhibition_id"
          defaultValue={searchParams.exhibition_id || ""}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">全展示会</option>
          {exhibitions?.map((exh) => (
            <option key={exh.id} value={exh.id}>
              {exh.name}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={searchParams.status || ""}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">全ステータス</option>
          <option value="confirmed">登録済</option>
          <option value="cancelled">キャンセル</option>
          <option value="waitlisted">ウェイトリスト</option>
        </select>
        <input
          name="q"
          type="text"
          defaultValue={searchParams.q || ""}
          placeholder="氏名・会社名・メール検索"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm flex-1 min-w-[200px]"
        />
        <button
          type="submit"
          className="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm hover:bg-blue-700 transition"
        >
          検索
        </button>
      </form>

      {/* 一覧テーブル */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 text-left text-sm text-gray-500">
              <tr>
                <th className="px-4 py-3">チケット</th>
                <th className="px-4 py-3">氏名</th>
                <th className="px-4 py-3">会社名</th>
                <th className="px-4 py-3">メール</th>
                <th className="px-4 py-3">種別</th>
                <th className="px-4 py-3">ステータス</th>
                <th className="px-4 py-3">登録日</th>
              </tr>
            </thead>
            <tbody className="divide-y text-sm">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link
                      href={`/${r.exhibition?.slug}/ticket/${r.ticket_code}`}
                      className="text-blue-600 hover:underline"
                    >
                      {r.ticket_code}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {r.visitor?.last_name} {r.visitor?.first_name}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {r.visitor?.company_name || "-"}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {r.visitor?.email}
                  </td>
                  <td className="px-4 py-3">
                    {r.registration_type ? (
                      <span
                        className="inline-block px-2 py-0.5 rounded text-xs text-white"
                        style={{
                          backgroundColor: r.registration_type.color,
                        }}
                      >
                        {r.registration_type.name}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        r.status === "confirmed"
                          ? "bg-green-100 text-green-800"
                          : r.status === "cancelled"
                            ? "bg-red-100 text-red-800"
                            : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {r.status === "confirmed"
                        ? "登録済"
                        : r.status === "cancelled"
                          ? "キャンセル"
                          : "待機"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(r.registered_at).toLocaleDateString("ja-JP")}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    登録者が見つかりません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
