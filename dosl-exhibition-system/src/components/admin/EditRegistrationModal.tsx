"use client";

import { useState } from "react";

interface RegistrationData {
  id: string;
  ticket_code: string;
  status: string;
  industry: string | null;
  visit_purpose: string[] | null;
  companions: Array<{ name: string; company?: string }>;
  visitor: {
    last_name: string;
    first_name: string;
    last_name_kana: string | null;
    first_name_kana: string | null;
    email: string;
    company_name: string | null;
    department: string | null;
    position: string | null;
    phone: string | null;
    postal_code: string | null;
    address: string | null;
  };
}

interface EditRegistrationModalProps {
  registration: RegistrationData;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditRegistrationModal({
  registration,
  onClose,
  onSaved,
}: EditRegistrationModalProps) {
  const v = registration.visitor;
  const [form, setForm] = useState({
    status: registration.status,
    last_name: v.last_name,
    first_name: v.first_name,
    last_name_kana: v.last_name_kana || "",
    first_name_kana: v.first_name_kana || "",
    company_name: v.company_name || "",
    department: v.department || "",
    position: v.position || "",
    phone: v.phone || "",
    postal_code: v.postal_code || "",
    address: v.address || "",
    industry: registration.industry || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError("");

    try {
      const res = await fetch(`/api/registrations/${registration.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "更新に失敗しました");
        return;
      }

      onSaved();
    } catch {
      setError("ネットワークエラー");
    } finally {
      setSaving(false);
    }
  }

  async function handleSendEmail() {
    if (
      !confirm(
        `${v.last_name} ${v.first_name} 様 (${v.email}) に確認メールを送信しますか？`,
      )
    )
      return;

    try {
      const res = await fetch("/api/email/confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registration_id: registration.id }),
      });
      const data = await res.json();

      if (data.success) {
        alert("メールを送信しました");
      } else {
        alert(`送信失敗: ${data.error}`);
      }
    } catch {
      alert("ネットワークエラー");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white rounded-t-2xl">
          <div>
            <h2 className="text-lg font-bold">登録情報の編集</h2>
            <p className="text-sm text-gray-400 font-mono">
              {registration.ticket_code}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            {"\u00D7"}
          </button>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* ステータス */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ステータス
            </label>
            <select
              value={form.status}
              onChange={(e) => update("status", e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="confirmed">登録済</option>
              <option value="cancelled">キャンセル</option>
              <option value="waitlisted">ウェイトリスト</option>
            </select>
          </div>

          {/* 氏名 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                姓
              </label>
              <input
                type="text"
                value={form.last_name}
                onChange={(e) => update("last_name", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                名
              </label>
              <input
                type="text"
                value={form.first_name}
                onChange={(e) => update("first_name", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                セイ
              </label>
              <input
                type="text"
                value={form.last_name_kana}
                onChange={(e) => update("last_name_kana", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                メイ
              </label>
              <input
                type="text"
                value={form.first_name_kana}
                onChange={(e) => update("first_name_kana", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* メール（読み取り専用） */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              メールアドレス
            </label>
            <input
              type="email"
              value={v.email}
              disabled
              className="w-full rounded-lg border border-gray-200 px-4 py-2.5 bg-gray-50 text-gray-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              メールアドレスは変更できません（一意キーのため）
            </p>
          </div>

          {/* 会社情報 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              会社名
            </label>
            <input
              type="text"
              value={form.company_name}
              onChange={(e) => update("company_name", e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                部署
              </label>
              <input
                type="text"
                value={form.department}
                onChange={(e) => update("department", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                役職
              </label>
              <input
                type="text"
                value={form.position}
                onChange={(e) => update("position", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                電話番号
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                業種
              </label>
              <input
                type="text"
                value={form.industry}
                onChange={(e) => update("industry", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                郵便番号
              </label>
              <input
                type="text"
                value={form.postal_code}
                onChange={(e) => update("postal_code", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              住所
            </label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => update("address", e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* フッター */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
          <button
            onClick={handleSendEmail}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            確認メールを送信
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 transition"
            >
              キャンセル
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
            >
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
