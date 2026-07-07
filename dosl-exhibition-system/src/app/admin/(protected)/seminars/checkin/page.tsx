"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";

// セミナー当日受付（GATEオプション）
// 受付するセミナーを選択し、入場証QRをスキャンして聴講実績を記録する

const QRScanner = dynamic(() => import("@/components/qr/QRScanner"), {
  ssr: false,
  loading: () => (
    <div className="bg-gray-100 rounded-xl p-12 text-center text-gray-400">
      カメラ読み込み中...
    </div>
  ),
});

interface Exhibition {
  id: string;
  name: string;
  features?: { seminar?: boolean };
}

interface SeminarOption {
  id: string;
  title: string;
  starts_at: string;
  venue_name: string | null;
  status: string;
}

interface CheckinResult {
  success: boolean;
  error?: string;
  already_checked_in?: boolean;
  seminar?: { title: string; venue_name: string | null };
  registration?: {
    ticket_code: string;
    visitor: {
      last_name: string;
      first_name: string;
      company_name: string | null;
    };
    registration_type?: { name: string; color: string } | null;
  };
}

type InputMode = "camera" | "manual";

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SeminarCheckinPage() {
  const [exhibitions, setExhibitions] = useState<Exhibition[]>([]);
  const [exhibitionId, setExhibitionId] = useState("");
  const [seminars, setSeminars] = useState<SeminarOption[]>([]);
  const [seminarId, setSeminarId] = useState("");
  const [mode, setMode] = useState<InputMode>("camera");
  const [ticketCode, setTicketCode] = useState("");
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<CheckinResult[]>([]);

  useEffect(() => {
    fetch("/api/exhibitions")
      .then((r) => r.json())
      .then((d) => {
        const list: Exhibition[] = (d.exhibitions || []).filter(
          (e: Exhibition) => e.features?.seminar === true,
        );
        setExhibitions(list);
        if (list.length > 0) setExhibitionId(list[0].id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!exhibitionId) return;
    fetch(`/api/seminars?exhibition_id=${exhibitionId}`)
      .then((r) => r.json())
      .then((d) => {
        const list: SeminarOption[] = (d.seminars || []).filter(
          (s: SeminarOption) => s.status === "open" || s.status === "closed",
        );
        setSeminars(list);
        setSeminarId(list.length > 0 ? list[0].id : "");
      })
      .catch(() => setSeminars([]));
  }, [exhibitionId]);

  const doCheckin = useCallback(
    async (code: string, method: "qr" | "manual") => {
      if (loading || !seminarId) return;
      setLoading(true);
      setResult(null);

      try {
        const res = await fetch("/api/seminars/checkin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticket_code: code.trim(),
            seminar_id: seminarId,
            method,
          }),
        });
        const data: CheckinResult = await res.json();
        setResult(data);
        if (data.success) {
          setHistory((prev) => [data, ...prev.slice(0, 49)]);
          setTicketCode("");
        }
      } catch {
        setResult({ success: false, error: "ネットワークエラー" });
      } finally {
        setLoading(false);
      }
    },
    [loading, seminarId],
  );

  const handleQRScan = useCallback(
    (code: string) => {
      doCheckin(code, "qr");
    },
    [doCheckin],
  );

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (ticketCode.trim()) {
      doCheckin(ticketCode, "manual");
    }
  }

  const selectedSeminar = seminars.find((s) => s.id === seminarId);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="mb-1">
            <Link
              href="/admin/seminars"
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              ← セミナー管理
            </Link>
          </div>
          <h1 className="text-2xl font-bold">セミナー受付</h1>
        </div>
        <span className="text-sm text-gray-400">
          処理済: {history.length}件
        </span>
      </div>

      {/* 受付対象の選択 */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6 flex flex-wrap gap-3">
        {exhibitions.length > 1 && (
          <select
            value={exhibitionId}
            onChange={(e) => setExhibitionId(e.target.value)}
            className="rounded-lg border border-gray-300 px-4 py-2.5 bg-white focus:outline-none focus:border-blue-500"
          >
            {exhibitions.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        )}
        <select
          value={seminarId}
          onChange={(e) => {
            setSeminarId(e.target.value);
            setResult(null);
          }}
          className="flex-1 min-w-64 rounded-lg border-2 border-blue-300 px-4 py-2.5 bg-white font-medium focus:outline-none focus:border-blue-500"
        >
          {seminars.length === 0 && (
            <option value="">受付可能なセミナーがありません</option>
          )}
          {seminars.map((s) => (
            <option key={s.id} value={s.id}>
              {formatDateTime(s.starts_at)} {s.title}
              {s.venue_name ? `（${s.venue_name}）` : ""}
            </option>
          ))}
        </select>
      </div>

      {/* モード切替タブ */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setMode("camera")}
          className={`px-5 py-2.5 rounded-lg font-medium transition ${
            mode === "camera"
              ? "bg-blue-600 text-white"
              : "bg-white text-gray-600 border border-gray-300 hover:bg-gray-50"
          }`}
        >
          QRカメラ
        </button>
        <button
          onClick={() => setMode("manual")}
          className={`px-5 py-2.5 rounded-lg font-medium transition ${
            mode === "manual"
              ? "bg-blue-600 text-white"
              : "bg-white text-gray-600 border border-gray-300 hover:bg-gray-50"
          }`}
        >
          手動入力
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左: 入力エリア */}
        <div>
          {!seminarId ? (
            <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">
              受付するセミナーを選択してください
            </div>
          ) : mode === "camera" ? (
            <div className="bg-white rounded-xl shadow-sm p-4">
              <h2 className="text-sm font-medium text-gray-500 mb-3">
                入場証のQRコードをカメラにかざしてください
              </h2>
              <QRScanner onScan={handleQRScan} active={mode === "camera"} />
              {loading && (
                <div className="mt-3 text-center text-blue-600 font-medium animate-pulse">
                  受付処理中...
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-sm font-medium text-gray-500 mb-3">
                チケットコードを入力
              </h2>
              <form onSubmit={handleManualSubmit} className="space-y-4">
                <input
                  type="text"
                  value={ticketCode}
                  onChange={(e) => setTicketCode(e.target.value.toUpperCase())}
                  placeholder="例: ABCD1234"
                  className="w-full rounded-lg border-2 border-gray-300 px-4 py-4 text-2xl font-mono tracking-widest text-center focus:outline-none focus:border-blue-500 transition"
                  autoFocus
                  maxLength={8}
                />
                <button
                  type="submit"
                  disabled={loading || !ticketCode.trim()}
                  className="w-full rounded-lg bg-green-600 text-white px-8 py-3 text-lg font-bold hover:bg-green-700 transition disabled:opacity-50"
                >
                  {loading ? "確認中..." : "セミナー受付"}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* 右: 結果表示 */}
        <div>
          {result ? (
            <div
              className={`rounded-xl shadow-sm p-6 mb-6 ${
                result.success
                  ? result.already_checked_in
                    ? "bg-yellow-50 border-2 border-yellow-400"
                    : "bg-green-50 border-2 border-green-400"
                  : "bg-red-50 border-2 border-red-400"
              }`}
            >
              {result.success && result.registration ? (
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-5xl">
                      {result.already_checked_in ? "⚠" : "✓"}
                    </span>
                    <div>
                      <h2 className="text-xl font-bold">
                        {result.already_checked_in
                          ? "受付済みです"
                          : "セミナー受付完了"}
                      </h2>
                      <p className="text-sm text-gray-500 font-mono">
                        {result.registration.ticket_code}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="bg-white rounded-lg p-4">
                      <p className="text-gray-500 text-xs mb-1">セミナー</p>
                      <p className="font-medium">{result.seminar?.title}</p>
                    </div>
                    <div className="bg-white rounded-lg p-4">
                      <p className="text-gray-500 text-xs mb-1">氏名</p>
                      <p className="font-bold text-2xl">
                        {result.registration.visitor.last_name}{" "}
                        {result.registration.visitor.first_name}
                      </p>
                    </div>
                    <div className="bg-white rounded-lg p-4">
                      <p className="text-gray-500 text-xs mb-1">会社名</p>
                      <p className="font-medium text-lg">
                        {result.registration.visitor.company_name || "-"}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-5xl">{"✗"}</span>
                  <div>
                    <h2 className="text-xl font-bold text-red-800">
                      受付できません
                    </h2>
                    <p className="text-red-600">{result.error}</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-300">
              <p className="text-6xl mb-4">{"\u{1F39F}"}</p>
              {selectedSeminar ? (
                <p>
                  「{selectedSeminar.title}」の受付中。
                  <br />
                  QRコードをスキャンすると結果が表示されます
                </p>
              ) : (
                <p>セミナーを選択してください</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 受付履歴 */}
      {history.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden mt-6">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h2 className="text-lg font-bold">受付履歴</h2>
            <span className="text-sm text-gray-400">{history.length}件</span>
          </div>
          <div className="divide-y max-h-80 overflow-y-auto">
            {history.map((h, i) =>
              h.registration ? (
                <div key={i} className="px-6 py-3 flex items-center gap-4">
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${h.already_checked_in ? "bg-yellow-400" : "bg-green-400"}`}
                  />
                  <span className="font-mono text-sm text-gray-500 w-20">
                    {h.registration.ticket_code}
                  </span>
                  <span className="font-medium">
                    {h.registration.visitor.last_name}{" "}
                    {h.registration.visitor.first_name}
                  </span>
                  <span className="text-sm text-gray-400 flex-1">
                    {h.seminar?.title}
                  </span>
                  {h.already_checked_in && (
                    <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">
                      受付済
                    </span>
                  )}
                </div>
              ) : null,
            )}
          </div>
        </div>
      )}
    </div>
  );
}
