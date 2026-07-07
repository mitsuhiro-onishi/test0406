"use client";

import { useEffect, useState } from "react";

// 出展社の作成・編集モーダル（リードリトリーバル・GATEオプション）

export interface ExhibitorFormValues {
  id?: string;
  name: string;
  booth_number: string | null;
  contact_name: string | null;
  contact_email: string | null;
  is_active: boolean;
}

interface Props {
  exhibitionId: string;
  exhibitor: ExhibitorFormValues | null; // null = 新規作成
  onClose: () => void;
  onSaved: () => void;
}

export default function ExhibitorFormModal({
  exhibitionId,
  exhibitor,
  onClose,
  onSaved,
}: Props) {
  const isNew = !exhibitor?.id;
  const [name, setName] = useState(exhibitor?.name || "");
  const [boothNumber, setBoothNumber] = useState(exhibitor?.booth_number || "");
  const [contactName, setContactName] = useState(exhibitor?.contact_name || "");
  const [contactEmail, setContactEmail] = useState(
    exhibitor?.contact_email || "",
  );
  const [isActive, setIsActive] = useState(exhibitor?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload: Record<string, unknown> = {
      name,
      booth_number: boothNumber || null,
      contact_name: contactName || null,
      contact_email: contactEmail || null,
      is_active: isActive,
    };

    try {
      const res = await fetch(
        isNew ? "/api/exhibitors" : `/api/exhibitors/${exhibitor!.id}`,
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isNew ? { exhibition_id: exhibitionId, ...payload } : payload,
          ),
        },
      );
      const result = await res.json();
      if (!result.success) {
        setError(result.error || "保存に失敗しました");
        return;
      }
      onSaved();
    } catch {
      setError("ネットワークエラーが発生しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-bold">
            {isNew ? "出展社を登録" : "出展社を編集"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="閉じる"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-300 text-red-700 rounded-lg px-4 py-3 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              出展社名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ブース番号
              </label>
              <input
                type="text"
                value={boothNumber}
                onChange={(e) => setBoothNumber(e.target.value)}
                maxLength={20}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                担当者名
              </label>
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                maxLength={50}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              担当者メール
            </label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              maxLength={254}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:border-blue-500"
            />
          </div>

          {!isNew && (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded"
              />
              有効（チェックを外すとこの出展社はログインできなくなります）
            </label>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition disabled:opacity-50"
            >
              {saving ? "保存中..." : isNew ? "登録" : "保存"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
