"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";

// html5-qrcode はブラウザ専用なので dynamic import
const QRScanner = dynamic(() => import("@/components/qr/QRScanner"), {
  ssr: false,
  loading: () => (
    <div className="bg-gray-100 rounded-xl p-12 text-center text-gray-400">
      カメラ読み込み中...
    </div>
  ),
});

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

type InputMode = "camera" | "manual";

export default function CheckinPage() {
  const [mode, setMode] = useState<InputMode>("camera");
  const [ticketCode, setTicketCode] = useState("");
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<CheckinResult[]>([]);

  const doCheckin = useCallback(
    async (code: string, method: "qr" | "manual") => {
      if (loading) return;
      setLoading(true);
      setResult(null);

      try {
        const res = await fetch("/api/checkin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticket_code: code.trim(), method }),
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
    [loading],
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

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">受付チェックイン</h1>
        <span className="text-sm text-gray-400">
          処理済: {history.length}件
        </span>
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
          {mode === "camera" ? (
            <div className="bg-white rounded-xl shadow-sm p-4">
              <h2 className="text-sm font-medium text-gray-500 mb-3">
                QRコードをカメラにかざしてください
              </h2>
              <QRScanner onScan={handleQRScan} active={mode === "camera"} />
              {loading && (
                <div className="mt-3 text-center text-blue-600 font-medium animate-pulse">
                  チェックイン処理中...
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
                  onChange={(e) =>
                    setTicketCode(e.target.value.toUpperCase())
                  }
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
                  {loading ? "確認中..." : "チェックイン"}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* 右: 結果表示 */}
        <div>
          {/* チェックイン結果 */}
          {result ? (
            <div
              className={`rounded-xl shadow-sm p-6 mb-6 ${
                result.success
                  ? result.already_entered
                    ? "bg-yellow-50 border-2 border-yellow-400"
                    : "bg-green-50 border-2 border-green-400"
                  : "bg-red-50 border-2 border-red-400"
              }`}
            >
              {result.success && result.registration ? (
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-5xl">
                      {result.already_entered ? "\u26A0" : "\u2713"}
                    </span>
                    <div>
                      <h2 className="text-xl font-bold">
                        {result.already_entered
                          ? "再入場（既に入場済み）"
                          : "チェックイン完了"}
                      </h2>
                      <p className="text-sm text-gray-500 font-mono">
                        {result.registration.ticket_code}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
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

                    {result.registration.registration_type && (
                      <div className="bg-white rounded-lg p-4">
                        <p className="text-gray-500 text-xs mb-1">種別</p>
                        <span
                          className="inline-block px-3 py-1 rounded text-white text-sm font-medium"
                          style={{
                            backgroundColor:
                              result.registration.registration_type.color,
                          }}
                        >
                          {result.registration.registration_type.name}
                        </span>
                      </div>
                    )}

                    {result.registration.companions.length > 0 && (
                      <div className="bg-white rounded-lg p-4">
                        <p className="text-gray-500 text-xs mb-1">
                          同伴者（{result.registration.companions.length}名）
                        </p>
                        <ul className="space-y-1">
                          {result.registration.companions.map((c, i) => (
                            <li key={i} className="font-medium">
                              {c.name}
                              {c.company && (
                                <span className="text-gray-400 text-sm ml-2">
                                  ({c.company})
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-5xl">{"\u2717"}</span>
                  <div>
                    <h2 className="text-xl font-bold text-red-800">
                      チェックイン失敗
                    </h2>
                    <p className="text-red-600">{result.error}</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-300">
              <p className="text-6xl mb-4">{"\u{1F4F7}"}</p>
              <p>QRコードをスキャンすると結果が表示されます</p>
            </div>
          )}
        </div>
      </div>

      {/* チェックイン履歴 */}
      {history.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden mt-6">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h2 className="text-lg font-bold">チェックイン履歴</h2>
            <span className="text-sm text-gray-400">{history.length}件</span>
          </div>
          <div className="divide-y max-h-80 overflow-y-auto">
            {history.map((h, i) =>
              h.registration ? (
                <div key={i} className="px-6 py-3 flex items-center gap-4">
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${h.already_entered ? "bg-yellow-400" : "bg-green-400"}`}
                  />
                  <span className="font-mono text-sm text-gray-500 w-20">
                    {h.registration.ticket_code}
                  </span>
                  <span className="font-medium">
                    {h.registration.visitor.last_name}{" "}
                    {h.registration.visitor.first_name}
                  </span>
                  <span className="text-sm text-gray-400 flex-1">
                    {h.registration.visitor.company_name}
                  </span>
                  {h.registration.registration_type && (
                    <span
                      className="px-2 py-0.5 rounded text-xs text-white"
                      style={{
                        backgroundColor:
                          h.registration.registration_type.color,
                      }}
                    >
                      {h.registration.registration_type.name}
                    </span>
                  )}
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
