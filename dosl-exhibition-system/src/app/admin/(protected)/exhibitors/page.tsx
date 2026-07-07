"use client";

import { useState, useEffect, useCallback } from "react";
import ExhibitorFormModal, {
  type ExhibitorFormValues,
} from "@/components/admin/ExhibitorFormModal";

// 出展社管理（リードリトリーバル・GATEオプション）
// features.lead_retrieval が有効な展示会のみ選択できる

interface Exhibition {
  id: string;
  name: string;
  features?: { lead_retrieval?: boolean };
}

interface ExhibitorRow {
  id: string;
  exhibition_id: string;
  name: string;
  booth_number: string | null;
  contact_name: string | null;
  contact_email: string | null;
  access_code: string;
  is_active: boolean;
  lead_count: number;
}

export default function ExhibitorsPage() {
  const [exhibitions, setExhibitions] = useState<Exhibition[]>([]);
  const [exhibitionId, setExhibitionId] = useState("");
  const [exhibitors, setExhibitors] = useState<ExhibitorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalExhibitor, setModalExhibitor] = useState<
    ExhibitorFormValues | null | "new"
  >(null);
  const [regenerating, setRegenerating] = useState<string | null>(null);

  const leadExhibitions = exhibitions.filter(
    (e) => e.features?.lead_retrieval === true,
  );

  useEffect(() => {
    fetch("/api/exhibitions")
      .then((r) => r.json())
      .then((d) => {
        const list: Exhibition[] = d.exhibitions || [];
        setExhibitions(list);
        const first = list.find((e) => e.features?.lead_retrieval === true);
        if (first) setExhibitionId(first.id);
        else setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const fetchExhibitors = useCallback(async () => {
    if (!exhibitionId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/exhibitors?exhibition_id=${exhibitionId}`);
      const json = await res.json();
      setExhibitors(json.exhibitors || []);
    } catch {
      setExhibitors([]);
    } finally {
      setLoading(false);
    }
  }, [exhibitionId]);

  useEffect(() => {
    fetchExhibitors();
  }, [fetchExhibitors]);

  async function handleRegenerate(ex: ExhibitorRow) {
    if (
      !confirm(
        `「${ex.name}」のアクセスコードを再発行しますか？\n現在のコード（${ex.access_code}）は使えなくなります。`,
      )
    )
      return;

    setRegenerating(ex.id);
    try {
      const res = await fetch(`/api/exhibitors/${ex.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate_access_code: true }),
      });
      const data = await res.json();
      if (data.success) {
        fetchExhibitors();
      } else {
        alert(data.error || "再発行に失敗しました");
      }
    } catch {
      alert("ネットワークエラーが発生しました");
    } finally {
      setRegenerating(null);
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">出展社管理（リード）</h1>
        <button
          onClick={() => setModalExhibitor("new")}
          disabled={!exhibitionId}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
        >
          ＋ 出展社を登録
        </button>
      </div>

      <div className="mb-6">
        <select
          value={exhibitionId}
          onChange={(e) => setExhibitionId(e.target.value)}
          className="rounded-lg border border-gray-300 px-4 py-2.5 bg-white focus:outline-none focus:border-blue-500"
        >
          {leadExhibitions.length === 0 && (
            <option value="">リードオプション有効の展示会なし</option>
          )}
          {leadExhibitions.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>

      {leadExhibitions.length === 0 && !loading ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">
          <p className="mb-2 font-medium">
            リードオプションが有効な展示会がありません
          </p>
          <p className="text-sm">
            展示会の features.lead_retrieval を有効にすると出展社管理が使えます
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
                <th className="px-4 py-3 font-medium">出展社名</th>
                <th className="px-4 py-3 font-medium">ブース</th>
                <th className="px-4 py-3 font-medium">担当者</th>
                <th className="px-4 py-3 font-medium">アクセスコード</th>
                <th className="px-4 py-3 font-medium text-right">リード数</th>
                <th className="px-4 py-3 font-medium">状態</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {exhibitors.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                    出展社がありません。「＋ 出展社を登録」から追加してください
                  </td>
                </tr>
              )}
              {exhibitors.map((ex) => (
                <tr key={ex.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{ex.name}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {ex.booth_number || "-"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {ex.contact_name || "-"}
                    {ex.contact_email && (
                      <span className="text-gray-400 text-xs block">
                        {ex.contact_email}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-gray-700 bg-gray-100 px-2 py-1 rounded">
                      {ex.access_code}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {ex.lead_count}
                  </td>
                  <td className="px-4 py-3">
                    {ex.is_active ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        有効
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                        無効
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <button
                      onClick={() => setModalExhibitor(ex)}
                      className="text-blue-600 hover:underline mr-3"
                    >
                      編集
                    </button>
                    <button
                      onClick={() => handleRegenerate(ex)}
                      disabled={regenerating === ex.id}
                      className="text-blue-600 hover:underline disabled:opacity-50"
                    >
                      {regenerating === ex.id ? "再発行中..." : "コード再発行"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalExhibitor !== null && (
        <ExhibitorFormModal
          exhibitionId={exhibitionId}
          exhibitor={modalExhibitor === "new" ? null : modalExhibitor}
          onClose={() => setModalExhibitor(null)}
          onSaved={() => {
            setModalExhibitor(null);
            fetchExhibitors();
          }}
        />
      )}
    </div>
  );
}
