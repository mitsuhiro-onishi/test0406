import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // 展示会一覧と統計を取得
  const { data: exhibitions } = await supabaseAdmin
    .from("exhibitions")
    .select("*")
    .order("start_date", { ascending: false });

  // 各展示会の登録数を取得
  const stats = await Promise.all(
    (exhibitions || []).map(async (exh) => {
      const { count: confirmed } = await supabaseAdmin
        .from("registrations")
        .select("*", { count: "exact", head: true })
        .eq("exhibition_id", exh.id)
        .eq("status", "confirmed");

      const { count: entries } = await supabaseAdmin
        .from("entry_logs")
        .select("*", { count: "exact", head: true })
        .in(
          "registration_id",
          (
            await supabaseAdmin
              .from("registrations")
              .select("id")
              .eq("exhibition_id", exh.id)
          ).data?.map((r) => r.id) || [],
        )
        .eq("action", "entry");

      return {
        ...exh,
        confirmed_count: confirmed || 0,
        entry_count: entries || 0,
      };
    }),
  );

  const statusLabel = (status: string) => {
    const map: Record<string, { label: string; color: string }> = {
      draft: { label: "下書き", color: "bg-gray-200 text-gray-700" },
      published: { label: "公開中", color: "bg-green-100 text-green-800" },
      closed: { label: "終了", color: "bg-red-100 text-red-800" },
      archived: { label: "アーカイブ", color: "bg-gray-100 text-gray-500" },
    };
    return map[status] || { label: status, color: "bg-gray-200" };
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">ダッシュボード</h1>

      {/* サマリーカード */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <p className="text-sm text-gray-500">展示会数</p>
          <p className="text-3xl font-bold mt-1">{stats.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6">
          <p className="text-sm text-gray-500">総登録者数</p>
          <p className="text-3xl font-bold mt-1">
            {stats.reduce((sum, s) => sum + s.confirmed_count, 0)}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6">
          <p className="text-sm text-gray-500">総入場者数</p>
          <p className="text-3xl font-bold mt-1">
            {stats.reduce((sum, s) => sum + s.entry_count, 0)}
          </p>
        </div>
      </div>

      {/* 展示会一覧 */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-bold">展示会一覧</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 text-left text-sm text-gray-500">
            <tr>
              <th className="px-6 py-3">展示会名</th>
              <th className="px-6 py-3">期間</th>
              <th className="px-6 py-3">ステータス</th>
              <th className="px-6 py-3 text-right">登録者</th>
              <th className="px-6 py-3 text-right">入場者</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {stats.map((exh) => {
              const s = statusLabel(exh.status);
              return (
                <tr key={exh.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="font-medium">{exh.name}</div>
                    <div className="text-sm text-gray-400">/{exh.slug}</div>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {exh.start_date} 〜 {exh.end_date}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${s.color}`}
                    >
                      {s.label}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-mono">
                    {exh.confirmed_count}
                    {exh.max_registrations && (
                      <span className="text-gray-400">
                        /{exh.max_registrations}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right font-mono">
                    {exh.entry_count}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
