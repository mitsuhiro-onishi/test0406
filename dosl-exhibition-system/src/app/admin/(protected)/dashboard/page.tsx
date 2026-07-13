import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// 展示会運営は常に「この展示会がどうか」の単位で見るため、
// 全展示会の合算サマリーは置かず、展示会ごとのカードを主役にする（2026-07-13 方針）

export default async function DashboardPage() {
  const { data: exhibitions } = await supabaseAdmin
    .from("exhibitions")
    .select("*")
    .order("start_date", { ascending: false });

  const stats = await Promise.all(
    (exhibitions || []).map(async (exh) => {
      const { count: confirmed } = await supabaseAdmin
        .from("registrations")
        .select("*", { count: "exact", head: true })
        .eq("exhibition_id", exh.id)
        .eq("status", "confirmed");

      // 来場者数 = 入場ログのあるユニーク登録数（同一人物の再入場は1と数える）
      const { data: regIds } = await supabaseAdmin
        .from("registrations")
        .select("id")
        .eq("exhibition_id", exh.id);
      let visited = 0;
      if (regIds && regIds.length > 0) {
        const { data: logs } = await supabaseAdmin
          .from("entry_logs")
          .select("registration_id")
          .eq("action", "entry")
          .in(
            "registration_id",
            regIds.map((r) => r.id),
          );
        visited = new Set((logs || []).map((l) => l.registration_id)).size;
      }

      return {
        ...exh,
        confirmed_count: confirmed || 0,
        visited_count: visited,
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

      {stats.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">
          展示会がまだありません
        </div>
      )}

      {/* 展示会ごとのカード */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {stats.map((exh) => {
          const s = statusLabel(exh.status);
          const rate =
            exh.confirmed_count > 0
              ? Math.round((exh.visited_count / exh.confirmed_count) * 100)
              : 0;
          return (
            <Link
              key={exh.id}
              href={`/admin/registrations?exhibition_id=${exh.id}`}
              className="block bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-bold text-lg leading-snug">
                    {exh.name}
                  </h2>
                  <p className="text-sm text-gray-400 mt-0.5">
                    {exh.start_date} 〜 {exh.end_date}
                  </p>
                </div>
                <span
                  className={`shrink-0 inline-block px-2 py-1 rounded-full text-xs font-medium ${s.color}`}
                >
                  {s.label}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-4 mt-5">
                <div>
                  <p className="text-xs text-gray-500">登録者</p>
                  <p className="text-2xl font-bold mt-0.5">
                    {exh.confirmed_count}
                    {exh.max_registrations && (
                      <span className="text-sm font-normal text-gray-400">
                        /{exh.max_registrations}
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">来場者</p>
                  <p className="text-2xl font-bold mt-0.5">
                    {exh.visited_count}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">来場率</p>
                  <p className="text-2xl font-bold mt-0.5">{rate}%</p>
                </div>
              </div>

              <p className="text-xs text-blue-600 mt-4">登録者一覧を見る →</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
