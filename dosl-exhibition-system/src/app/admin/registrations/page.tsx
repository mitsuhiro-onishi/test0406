"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface RegistrationRow {
  id: string;
  ticket_code: string;
  status: string;
  industry: string | null;
  visit_purpose: string[] | null;
  companions: Array<{ name: string; company?: string }>;
  registered_at: string;
  visitor: {
    last_name: string;
    first_name: string;
    last_name_kana: string | null;
    first_name_kana: string | null;
    email: string;
    company_name: string | null;
    department: string | null;
    phone: string | null;
  };
  exhibition: { id: string; name: string; slug: string };
  registration_type: { name: string; color: string } | null;
}

interface ApiResponse {
  registrations: RegistrationRow[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export default function RegistrationsPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [exhibitionId, setExhibitionId] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [exhibitions, setExhibitions] = useState<
    { id: string; name: string }[]
  >([]);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // 展示会一覧を初期ロード
  useEffect(() => {
    fetch("/api/exhibitions")
      .then((r) => r.json())
      .then((d) => setExhibitions(d.exhibitions || []))
      .catch(() => {});
  }, []);

  const fetchRegistrations = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (exhibitionId) params.set("exhibition_id", exhibitionId);
    if (status) params.set("status", status);
    params.set("page", String(page));
    params.set("per_page", "50");

    try {
      const res = await fetch(`/api/registrations?${params}`);
      const json = await res.json();
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [query, exhibitionId, status, page]);

  useEffect(() => {
    fetchRegistrations();
  }, [fetchRegistrations]);

  // 検索はデバウンス
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const registrations = data?.registrations || [];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">登録者一覧</h1>
        <span className="text-sm text-gray-500">
          {data ? `${data.total}件` : ""}
        </span>
      </div>

      {/* 検索 & フィルター */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[250px]">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="氏名・会社名・メールアドレスで検索"
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <select
            value={exhibitionId}
            onChange={(e) => {
              setExhibitionId(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
          >
            <option value="">全展示会</option>
            {exhibitions.map((exh) => (
              <option key={exh.id} value={exh.id}>
                {exh.name}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
          >
            <option value="">全ステータス</option>
            <option value="confirmed">登録済</option>
            <option value="cancelled">キャンセル</option>
            <option value="waitlisted">ウェイトリスト</option>
          </select>
        </div>
      </div>

      {/* テーブル */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">読み込み中...</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 text-left text-sm text-gray-500">
                  <tr>
                    <th className="px-4 py-3 w-8"></th>
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
                  {registrations.map((r) => (
                    <>
                      <tr
                        key={r.id}
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() =>
                          setExpandedRow(
                            expandedRow === r.id ? null : r.id,
                          )
                        }
                      >
                        <td className="px-4 py-3 text-gray-400">
                          {expandedRow === r.id ? "\u25BC" : "\u25B6"}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          <Link
                            href={`/${r.exhibition?.slug}/ticket/${r.ticket_code}`}
                            className="text-blue-600 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {r.ticket_code}
                          </Link>
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {r.visitor.last_name} {r.visitor.first_name}
                          {r.visitor.last_name_kana && (
                            <span className="text-gray-400 text-xs ml-1">
                              ({r.visitor.last_name_kana}{" "}
                              {r.visitor.first_name_kana})
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {r.visitor.company_name || "-"}
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {r.visitor.email}
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
                          {new Date(r.registered_at).toLocaleDateString(
                            "ja-JP",
                          )}
                        </td>
                      </tr>
                      {/* 展開行: 詳細情報 */}
                      {expandedRow === r.id && (
                        <tr key={`${r.id}-detail`}>
                          <td colSpan={8} className="bg-gray-50 px-8 py-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              {r.visitor.department && (
                                <div>
                                  <span className="text-gray-400 text-xs">
                                    部署
                                  </span>
                                  <p>{r.visitor.department}</p>
                                </div>
                              )}
                              {r.visitor.phone && (
                                <div>
                                  <span className="text-gray-400 text-xs">
                                    電話番号
                                  </span>
                                  <p>{r.visitor.phone}</p>
                                </div>
                              )}
                              {r.industry && (
                                <div>
                                  <span className="text-gray-400 text-xs">
                                    業種
                                  </span>
                                  <p>{r.industry}</p>
                                </div>
                              )}
                              {r.visit_purpose && r.visit_purpose.length > 0 && (
                                <div>
                                  <span className="text-gray-400 text-xs">
                                    来場目的
                                  </span>
                                  <p>{r.visit_purpose.join(", ")}</p>
                                </div>
                              )}
                              {r.companions.length > 0 && (
                                <div className="col-span-2">
                                  <span className="text-gray-400 text-xs">
                                    同伴者 ({r.companions.length}名)
                                  </span>
                                  <p>
                                    {r.companions
                                      .map(
                                        (c) =>
                                          c.name +
                                          (c.company
                                            ? ` (${c.company})`
                                            : ""),
                                      )
                                      .join(", ")}
                                  </p>
                                </div>
                              )}
                              <div>
                                <span className="text-gray-400 text-xs">
                                  展示会
                                </span>
                                <p>{r.exhibition.name}</p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                  {registrations.length === 0 && (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-12 text-center text-gray-400"
                      >
                        {query
                          ? `「${query}」に一致する登録者が見つかりません`
                          : "登録者がいません"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* ページネーション */}
            {data && data.total_pages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t">
                <p className="text-sm text-gray-500">
                  {data.total}件中{" "}
                  {(page - 1) * data.per_page + 1}-
                  {Math.min(page * data.per_page, data.total)}件
                </p>
                <div className="flex gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                    className="px-3 py-1.5 rounded border text-sm disabled:opacity-30 hover:bg-gray-50"
                  >
                    前へ
                  </button>
                  <span className="px-3 py-1.5 text-sm text-gray-500">
                    {page} / {data.total_pages}
                  </span>
                  <button
                    disabled={page >= data.total_pages}
                    onClick={() => setPage(page + 1)}
                    className="px-3 py-1.5 rounded border text-sm disabled:opacity-30 hover:bg-gray-50"
                  >
                    次へ
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
