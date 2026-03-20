"use client";

import { useState } from "react";

interface CheckinResult {
  success: boolean;
  error?: string;
  already_entered?: boolean;
  registration?: {
    ticket_code: string;
    visitor: {
      last_name: string;
      first_name: string;
      company_name: string | null;
    };
    exhibition: { name: string };
    registration_type?: { name: string; color: string } | null;
    companions: Array<{ name: string; company?: string }>;
  };
}

export default function CheckinPage() {
  const [ticketCode, setTicketCode] = useState("");
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<CheckinResult[]>([]);

  async function handleCheckin(e: React.FormEvent) {
    e.preventDefault();
    if (!ticketCode.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket_code: ticketCode.trim(),
          method: "manual",
        }),
      });
      const data: CheckinResult = await res.json();
      setResult(data);
      if (data.success) {
        setHistory((prev) => [data, ...prev.slice(0, 19)]);
        setTicketCode("");
      }
    } catch {
      setResult({ success: false, error: "ネットワークエラー" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">受付チェックイン</h1>

      {/* チケットコード入力 */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <form onSubmit={handleCheckin} className="flex gap-4">
          <input
            type="text"
            value={ticketCode}
            onChange={(e) => setTicketCode(e.target.value.toUpperCase())}
            placeholder="チケットコードを入力"
            className="flex-1 rounded-lg border-2 border-gray-300 px-4 py-3 text-xl font-mono tracking-wider focus:outline-none focus:border-blue-500 transition"
            autoFocus
          />
          <button
            type="submit"
            disabled={loading || !ticketCode.trim()}
            className="rounded-lg bg-green-600 text-white px-8 py-3 text-lg font-bold hover:bg-green-700 transition disabled:opacity-50"
          >
            {loading ? "確認中..." : "チェックイン"}
          </button>
        </form>

        <p className="text-sm text-gray-400 mt-2">
          QRコードをスキャンするか、チケットコードを手入力してください
        </p>
      </div>

      {/* チェックイン結果 */}
      {result && (
        <div
          className={`rounded-xl shadow-sm p-6 mb-6 ${
            result.success
              ? result.already_entered
                ? "bg-yellow-50 border-2 border-yellow-300"
                : "bg-green-50 border-2 border-green-300"
              : "bg-red-50 border-2 border-red-300"
          }`}
        >
          {result.success && result.registration ? (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span
                  className={`text-4xl ${result.already_entered ? "" : ""}`}
                >
                  {result.already_entered ? "&#9888;" : "&#10003;"}
                </span>
                <div>
                  <h2 className="text-xl font-bold">
                    {result.already_entered
                      ? "再入場（既に入場済み）"
                      : "チェックイン完了"}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {result.registration.ticket_code}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">氏名</span>
                  <p className="font-bold text-lg">
                    {result.registration.visitor.last_name}{" "}
                    {result.registration.visitor.first_name}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">会社名</span>
                  <p className="font-medium">
                    {result.registration.visitor.company_name || "-"}
                  </p>
                </div>
                {result.registration.registration_type && (
                  <div>
                    <span className="text-gray-500">種別</span>
                    <p>
                      <span
                        className="inline-block px-2 py-0.5 rounded text-white text-xs"
                        style={{
                          backgroundColor:
                            result.registration.registration_type.color,
                        }}
                      >
                        {result.registration.registration_type.name}
                      </span>
                    </p>
                  </div>
                )}
                {result.registration.companions.length > 0 && (
                  <div>
                    <span className="text-gray-500">同伴者</span>
                    <p>
                      {result.registration.companions
                        .map((c) => c.name)
                        .join(", ")}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-4xl">&#10007;</span>
              <div>
                <h2 className="text-xl font-bold text-red-800">
                  チェックイン失敗
                </h2>
                <p className="text-red-600">{result.error}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* チェックイン履歴 */}
      {history.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-bold">チェックイン履歴</h2>
          </div>
          <div className="divide-y">
            {history.map((h, i) =>
              h.registration ? (
                <div key={i} className="px-6 py-3 flex items-center gap-4">
                  <span className="font-mono text-sm text-gray-500">
                    {h.registration.ticket_code}
                  </span>
                  <span className="font-medium">
                    {h.registration.visitor.last_name}{" "}
                    {h.registration.visitor.first_name}
                  </span>
                  <span className="text-sm text-gray-400">
                    {h.registration.visitor.company_name}
                  </span>
                  {h.already_entered && (
                    <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">
                      再入場
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
