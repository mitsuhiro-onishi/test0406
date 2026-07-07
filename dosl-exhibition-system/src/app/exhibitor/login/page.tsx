"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 出展社ログイン（リードリトリーバル・GATEオプション）

export default function ExhibitorLoginPage() {
  const router = useRouter();
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/exhibitor/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_code: accessCode.trim() }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "ログインに失敗しました");
        return;
      }
      router.push("/exhibitor");
      router.refresh();
    } catch {
      setError("ネットワークエラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <h1 className="text-xl font-bold">出展社リード管理</h1>
          <p className="text-gray-400 text-sm mt-1">DOSL GATE</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-300 text-red-700 rounded-lg px-4 py-3 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              アクセスコード
            </label>
            <input
              type="text"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
              placeholder="12文字の英数字"
              maxLength={12}
              autoFocus
              autoComplete="off"
              className="w-full rounded-lg border-2 border-gray-300 px-4 py-3 text-lg font-mono tracking-widest text-center focus:outline-none focus:border-blue-500 transition"
            />
            <p className="text-xs text-gray-400 mt-2">
              主催者から配布されたアクセスコードを入力してください
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || accessCode.trim().length !== 12}
            className="w-full rounded-lg bg-blue-600 text-white px-4 py-3 font-bold hover:bg-blue-700 transition disabled:opacity-50"
          >
            {loading ? "確認中..." : "ログイン"}
          </button>
        </form>
      </div>
    </div>
  );
}
