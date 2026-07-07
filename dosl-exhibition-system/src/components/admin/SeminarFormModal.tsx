"use client";

import { useEffect, useState } from "react";

// セミナーの作成・編集モーダル（GATEオプション）

export interface SeminarFormValues {
  id?: string;
  title: string;
  description: string | null;
  speaker_name: string | null;
  speaker_title: string | null;
  venue_name: string | null;
  capacity: number | null;
  starts_at: string;
  ends_at: string;
  status: string;
}

interface Props {
  exhibitionId: string;
  seminar: SeminarFormValues | null; // null = 新規作成
  onClose: () => void;
  onSaved: () => void;
}

const STATUS_OPTIONS = [
  { value: "draft", label: "下書き" },
  { value: "open", label: "公開中" },
  { value: "closed", label: "受付終了" },
  { value: "cancelled", label: "中止" },
];

/** TIMESTAMPTZ → <input type="datetime-local"> 用のローカル表記 */
function toLocalInput(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function SeminarFormModal({
  exhibitionId,
  seminar,
  onClose,
  onSaved,
}: Props) {
  const isNew = !seminar?.id;
  const [title, setTitle] = useState(seminar?.title || "");
  const [description, setDescription] = useState(seminar?.description || "");
  const [speakerName, setSpeakerName] = useState(seminar?.speaker_name || "");
  const [speakerTitle, setSpeakerTitle] = useState(
    seminar?.speaker_title || "",
  );
  const [venueName, setVenueName] = useState(seminar?.venue_name || "");
  const [capacity, setCapacity] = useState(
    seminar?.capacity != null ? String(seminar.capacity) : "",
  );
  const [startsAt, setStartsAt] = useState(toLocalInput(seminar?.starts_at));
  const [endsAt, setEndsAt] = useState(toLocalInput(seminar?.ends_at));
  const [status, setStatus] = useState(seminar?.status || "open");
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
      title,
      description: description || null,
      speaker_name: speakerName || null,
      speaker_title: speakerTitle || null,
      venue_name: venueName || null,
      capacity: capacity === "" ? null : Number(capacity),
      starts_at: startsAt,
      ends_at: endsAt,
      status,
    };

    try {
      const res = await fetch(
        isNew ? "/api/seminars" : `/api/seminars/${seminar!.id}`,
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
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-bold">
            {isNew ? "セミナーを作成" : "セミナーを編集"}
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
              タイトル <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={200}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              説明
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                講演者名
              </label>
              <input
                type="text"
                value={speakerName}
                onChange={(e) => setSpeakerName(e.target.value)}
                maxLength={100}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                講演者肩書
              </label>
              <input
                type="text"
                value={speakerTitle}
                onChange={(e) => setSpeakerTitle(e.target.value)}
                maxLength={100}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                会場名
              </label>
              <input
                type="text"
                value={venueName}
                onChange={(e) => setVenueName(e.target.value)}
                maxLength={100}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                定員（空欄で無制限）
              </label>
              <input
                type="number"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                min={1}
                max={100000}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                開始日時 <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                終了日時 <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ステータス
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:border-blue-500"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

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
              {saving ? "保存中..." : isNew ? "作成" : "保存"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
