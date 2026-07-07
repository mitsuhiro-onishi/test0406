"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import SeminarFormModal, {
  type SeminarFormValues,
} from "@/components/admin/SeminarFormModal";

// セミナー管理（GATEオプション）
// features.seminar が有効な展示会のみ選択できる

interface Exhibition {
  id: string;
  name: string;
  status: string;
  features?: { seminar?: boolean };
}

interface SeminarRow {
  id: string;
  exhibition_id: string;
  title: string;
  description: string | null;
  speaker_name: string | null;
  speaker_title: string | null;
  venue_name: string | null;
  capacity: number | null;
  starts_at: string;
  ends_at: string;
  status: string;
  stats: {
    confirmed_count: number;
    waitlisted_count: number;
    checked_in_count: number;
  };
}

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  draft: { label: "下書き", className: "bg-gray-100 text-gray-600" },
  open: { label: "公開中", className: "bg-green-100 text-green-700" },
  closed: { label: "受付終了", className: "bg-yellow-100 text-yellow-700" },
  cancelled: { label: "中止", className: "bg-red-100 text-red-700" },
};

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SeminarsPage() {
  const [exhibitions, setExhibitions] = useState<Exhibition[]>([]);
  const [exhibitionId, setExhibitionId] = useState("");
  const [seminars, setSeminars] = useState<SeminarRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalSeminar, setModalSeminar] = useState<
    SeminarFormValues | null | "new"
  >(null);

  // セミナーオプションが有効な展示会のみ
  const seminarExhibitions = exhibitions.filter(
    (e) => e.features?.seminar === true,
  );

  useEffect(() => {
    fetch("/api/exhibitions")
      .then((r) => r.json())
      .then((d) => {
        const list: Exhibition[] = d.exhibitions || [];
        setExhibitions(list);
        const first = list.find((e) => e.features?.seminar === true);
        if (first) setExhibitionId(first.id);
        else setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const fetchSeminars = useCallback(async () => {
    if (!exhibitionId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/seminars?exhibition_id=${exhibitionId}`);
      const json = await res.json();
      setSeminars(json.seminars || []);
    } catch {
      setSeminars([]);
    } finally {
      setLoading(false);
    }
  }, [exhibitionId]);

  useEffect(() => {
    fetchSeminars();
  }, [fetchSeminars]);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">セミナー管理</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/seminars/checkin"
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition text-sm font-medium"
          >
            セミナー受付（QR）
          </Link>
          <button
            onClick={() => setModalSeminar("new")}
            disabled={!exhibitionId}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
          >
            ＋ セミナーを作成
          </button>
        </div>
      </div>

      {/* 展示会セレクタ */}
      <div className="mb-6">
        <select
          value={exhibitionId}
          onChange={(e) => setExhibitionId(e.target.value)}
          className="rounded-lg border border-gray-300 px-4 py-2.5 bg-white focus:outline-none focus:border-blue-500"
        >
          {seminarExhibitions.length === 0 && (
            <option value="">セミナーオプション有効の展示会なし</option>
          )}
          {seminarExhibitions.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>

      {seminarExhibitions.length === 0 && !loading ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">
          <p className="mb-2 font-medium">
            セミナーオプションが有効な展示会がありません
          </p>
          <p className="text-sm">
            展示会の features.seminar を有効にするとセミナー管理が使えます
          </p>
        </div>
      ) : loading ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">
          読み込み中...
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-3 font-medium">日時</th>
                <th className="px-4 py-3 font-medium">タイトル</th>
                <th className="px-4 py-3 font-medium">講演者</th>
                <th className="px-4 py-3 font-medium">会場</th>
                <th className="px-4 py-3 font-medium text-right">予約</th>
                <th className="px-4 py-3 font-medium text-right">聴講</th>
                <th className="px-4 py-3 font-medium">ステータス</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {seminars.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                    セミナーがありません。「＋ セミナーを作成」から追加してください
                  </td>
                </tr>
              )}
              {seminars.map((s) => {
                const badge = STATUS_BADGES[s.status] || {
                  label: s.status,
                  className: "bg-gray-100 text-gray-600",
                };
                const full =
                  s.capacity != null && s.stats.confirmed_count >= s.capacity;
                return (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      {formatDateTime(s.starts_at)} 〜 {formatTime(s.ends_at)}
                    </td>
                    <td className="px-4 py-3 font-medium">{s.title}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {s.speaker_name || "-"}
                      {s.speaker_title && (
                        <span className="text-gray-400 text-xs ml-1">
                          ({s.speaker_title})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {s.venue_name || "-"}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span className={full ? "text-red-600 font-bold" : ""}>
                        {s.stats.confirmed_count}
                      </span>
                      <span className="text-gray-400">
                        {" "}
                        / {s.capacity ?? "∞"}
                      </span>
                      {full && (
                        <span className="ml-2 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                          満席
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {s.stats.checked_in_count}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        onClick={() => setModalSeminar(s)}
                        className="text-blue-600 hover:underline mr-3"
                      >
                        編集
                      </button>
                      <Link
                        href={`/admin/seminars/${s.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        実績
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalSeminar !== null && (
        <SeminarFormModal
          exhibitionId={exhibitionId}
          seminar={modalSeminar === "new" ? null : modalSeminar}
          onClose={() => setModalSeminar(null)}
          onSaved={() => {
            setModalSeminar(null);
            fetchSeminars();
          }}
        />
      )}
    </div>
  );
}
