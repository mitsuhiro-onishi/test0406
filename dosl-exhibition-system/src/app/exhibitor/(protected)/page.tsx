"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";

// リードスキャン画面（リードリトリーバル・GATEオプション）
// 来場者の入場証QRを読み取ってリードを記録する

const QRScanner = dynamic(() => import("@/components/qr/QRScanner"), {
  ssr: false,
  loading: () => (
    <div className="bg-gray-100 rounded-xl p-12 text-center text-gray-400">
      カメラ読み込み中...
    </div>
  ),
});

interface ScanResult {
  success: boolean;
  error?: string;
  already_scanned?: boolean;
  lead?: { id: string; note: string | null };
  visitor?: {
    last_name: string;
    first_name: string;
    company_name: string | null;
    department: string | null;
    position: string | null;
  };
}

type InputMode = "camera" | "manual";

export default function ExhibitorScanPage() {
  const [mode, setMode] = useState<InputMode>("camera");
  const [ticketCode, setTicketCode] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanCount, setScanCount] = useState(0);

  const doScan = useCallback(
    async (code: string) => {
      if (loading) return;
      setLoading(true);
      setResult(null);

      try {
        const res = await fetch("/api/exhibitor/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticket_code: code.trim() }),
        });
        const data: ScanResult = await res.json();
        setResult(data);
        if (data.success) {
          setTicketCode("");
          if (!data.already_scanned) setScanCount((c) => c + 1);
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
      doScan(code);
    },
    [doScan],
  );

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (ticketCode.trim()) {
      doScan(ticketCode);
    }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">リードスキャン</h1>
        <span className="text-sm text-gray-400">今回: {scanCount}件</span>
      </div>

      {/* モード切替 */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode("camera")}
          className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition ${
            mode === "camera"
              ? "bg-blue-600 text-white"
              : "bg-white text-gray-600 border border-gray-300"
          }`}
        >
          QRカメラ
        </button>
        <button
          onClick={() => setMode("manual")}
          className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition ${
            mode === "manual"
              ? "bg-blue-600 text-white"
              : "bg-white text-gray-600 border border-gray-300"
          }`}
        >
          手動入力
        </button>
      </div>

      {/* 入力エリア */}
      {mode === "camera" ? (
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-sm text-gray-500 mb-3">
            来場者の入場証QRをかざしてください
          </p>
          <QRScanner onScan={handleQRScan} active={mode === "camera"} />
          {loading && (
            <div className="mt-3 text-center text-blue-600 font-medium animate-pulse">
              記録中...
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm p-4">
          <form onSubmit={handleManualSubmit} className="space-y-3">
            <input
              type="text"
              value={ticketCode}
              onChange={(e) => setTicketCode(e.target.value.toUpperCase())}
              placeholder="チケットコード（8文字）"
              className="w-full rounded-lg border-2 border-gray-300 px-4 py-3 text-xl font-mono tracking-widest text-center focus:outline-none focus:border-blue-500 transition"
              autoFocus
              maxLength={8}
            />
            <button
              type="submit"
              disabled={loading || !ticketCode.trim()}
              className="w-full rounded-lg bg-green-600 text-white px-4 py-3 font-bold hover:bg-green-700 transition disabled:opacity-50"
            >
              {loading ? "確認中..." : "リード登録"}
            </button>
          </form>
        </div>
      )}

      {/* 結果 */}
      {result && (
        <div
          className={`rounded-xl shadow-sm p-5 ${
            result.success
              ? result.already_scanned
                ? "bg-yellow-50 border-2 border-yellow-400"
                : "bg-green-50 border-2 border-green-400"
              : "bg-red-50 border-2 border-red-400"
          }`}
        >
          {result.success && result.visitor ? (
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-4xl">
                  {result.already_scanned ? "⚠" : "✓"}
                </span>
                <h2 className="text-lg font-bold">
                  {result.already_scanned
                    ? "取得済みのリードです"
                    : "リードを記録しました"}
                </h2>
              </div>
              <div className="bg-white rounded-lg p-4">
                <p className="font-bold text-xl">
                  {result.visitor.last_name} {result.visitor.first_name}
                </p>
                <p className="text-gray-600 mt-1">
                  {result.visitor.company_name || "-"}
                </p>
                {(result.visitor.department || result.visitor.position) && (
                  <p className="text-gray-400 text-sm mt-0.5">
                    {[result.visitor.department, result.visitor.position]
                      .filter(Boolean)
                      .join(" / ")}
                  </p>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-3">
                連絡先などの詳細は「リード一覧」で確認できます
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-4xl">✗</span>
              <div>
                <h2 className="font-bold text-red-800">読み取れません</h2>
                <p className="text-red-600 text-sm">{result.error}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
