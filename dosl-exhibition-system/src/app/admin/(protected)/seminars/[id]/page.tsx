"use client";

import { use, useState, useEffect, useCallback } from "react";
import Link from "next/link";

// 聴講実績（GATEオプション）: セミナーの予約・チェックイン状況

interface SeminarInfo {
  id: string;
  title: string;
  capacity: number | null;
  starts_at: string;
  ends_at: string;
  status: string;
  venue_name: string | null;
}

interface BookingRow {
  id: string;
  status: string;
  checked_in_at: string | null;
  booked_at: string;
  registration: {
    id: string;
    ticket_code: string;
    status: string;
    visitor: {
      last_name: string;
      first_name: string;
      last_name_kana: string | null;
      first_name_kana: string | null;
      company_name: string | null;
      email: string;
    };
  };
}

const BOOKING_BADGES: Record<string, { label: string; className: string }> = {
  confirmed: { label: "予約済", className: "bg-green-100 text-green-700" },
  waitlisted: {
    label: "ウェイトリスト",
    className: "bg-yellow-100 text-yellow-700",
  },
  cancelled: { label: "キャンセル", className: "bg-red-100 text-red-700" },
};

function jst(value: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SeminarBookingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [seminar, setSeminar] = useState<SeminarInfo | null>(null);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/seminars/${id}/bookings`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "取得に失敗しました");
        return;
      }
      setSeminar(json.seminar);
      setBookings(json.bookings || []);
    } catch {
      setError("ネットワークエラーが発生しました");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const confirmed = bookings.filter((b) => b.status === "confirmed");
  const checkedIn = bookings.filter((b) => b.checked_in_at != null);

  if (loading) {
    return (
      <div className="p-8 text-gray-400">読み込み中...</div>
    );
  }
  if (error || !seminar) {
    return (
      <div className="p-8">
        <p className="text-red-600 mb-4">{error || "セミナーが見つかりません"}</p>
        <Link href="/admin/seminars" className="text-blue-600 hover:underline">
          ← セミナー管理へ戻る
        </Link>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-2">
        <Link
          href="/admin/seminars"
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          ← セミナー管理
        </Link>
      </div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{seminar.title}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {jst(seminar.starts_at)} 〜 {jst(seminar.ends_at)}
            {seminar.venue_name && ` ・ ${seminar.venue_name}`}
          </p>
        </div>
        <button
          onClick={() =>
            window.open(`/api/seminars/${seminar.id}/bookings/csv`, "_blank")
          }
          className="px-4 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition text-sm font-medium"
        >
          CSV
        </button>
      </div>

      {/* サマリー */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-5">
          <p className="text-xs text-gray-500 mb-1">予約数</p>
          <p className="text-2xl font-bold">
            {confirmed.length}
            <span className="text-sm text-gray-400 font-normal">
              {" "}
              / {seminar.capacity ?? "∞"}
            </span>
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5">
          <p className="text-xs text-gray-500 mb-1">聴講数</p>
          <p className="text-2xl font-bold">{checkedIn.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5">
          <p className="text-xs text-gray-500 mb-1">聴講率</p>
          <p className="text-2xl font-bold">
            {confirmed.length > 0
              ? Math.round((checkedIn.length / confirmed.length) * 100)
              : 0}
            %
          </p>
        </div>
      </div>

      {/* 予約一覧 */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">チケット</th>
              <th className="px-4 py-3 font-medium">氏名</th>
              <th className="px-4 py-3 font-medium">会社名</th>
              <th className="px-4 py-3 font-medium">メール</th>
              <th className="px-4 py-3 font-medium">予約</th>
              <th className="px-4 py-3 font-medium">聴講</th>
              <th className="px-4 py-3 font-medium">チェックイン日時</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {bookings.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                  予約がありません
                </td>
              </tr>
            )}
            {bookings.map((b) => {
              const badge = BOOKING_BADGES[b.status] || {
                label: b.status,
                className: "bg-gray-100 text-gray-600",
              };
              const v = b.registration.visitor;
              return (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-gray-500">
                    {b.registration.ticket_code}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {v.last_name} {v.first_name}
                    {(v.last_name_kana || v.first_name_kana) && (
                      <span className="text-gray-400 text-xs ml-1">
                        ({v.last_name_kana} {v.first_name_kana})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {v.company_name || "-"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{v.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {b.checked_in_at ? (
                      <span className="text-green-600 font-medium">聴講済</span>
                    ) : (
                      <span className="text-gray-400">未聴講</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {jst(b.checked_in_at) || "-"}
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
