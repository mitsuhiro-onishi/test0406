"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import type {
  Exhibition,
  RegistrationType,
  Seminar,
  Companion,
} from "@/types/database";

export default function RegisterPage({
  params,
}: {
  params: { slug: string };
}) {
  const [exhibition, setExhibition] = useState<Exhibition | null>(null);
  const [regTypes, setRegTypes] = useState<RegistrationType[]>([]);
  const [seminars, setSeminars] = useState<Seminar[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [ticketCode, setTicketCode] = useState("");

  // Form state
  const [form, setForm] = useState({
    email: "",
    last_name: "",
    first_name: "",
    last_name_kana: "",
    first_name_kana: "",
    company_name: "",
    company_kana: "",
    department: "",
    position: "",
    phone: "",
    postal_code: "",
    address: "",
    industry: "",
    visit_purpose: [] as string[],
    registration_type_slug: "",
    seminar_ids: [] as string[],
  });
  const [companions, setCompanions] = useState<Companion[]>([]);

  useEffect(() => {
    async function loadExhibition() {
      const { data: exh } = await supabase
        .from("exhibitions")
        .select("*")
        .eq("slug", params.slug)
        .single();

      if (!exh) {
        setLoading(false);
        return;
      }
      setExhibition(exh as Exhibition);

      const { data: types } = await supabase
        .from("registration_types")
        .select("*")
        .eq("exhibition_id", exh.id)
        .order("sort_order");
      setRegTypes((types as RegistrationType[]) || []);

      if (exh.features?.seminar) {
        const { data: sems } = await supabase
          .from("seminars")
          .select("*")
          .eq("exhibition_id", exh.id)
          .eq("status", "open")
          .order("starts_at");
        setSeminars((sems as Seminar[]) || []);
      }

      setLoading(false);
    }
    loadExhibition();
  }, [params.slug]);

  function updateForm(field: string, value: string | string[]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function togglePurpose(purpose: string) {
    setForm((prev) => ({
      ...prev,
      visit_purpose: prev.visit_purpose.includes(purpose)
        ? prev.visit_purpose.filter((p) => p !== purpose)
        : [...prev.visit_purpose, purpose],
    }));
  }

  function toggleSeminar(id: string) {
    setForm((prev) => ({
      ...prev,
      seminar_ids: prev.seminar_ids.includes(id)
        ? prev.seminar_ids.filter((s) => s !== id)
        : [...prev.seminar_ids, id],
    }));
  }

  function addCompanion() {
    const max = exhibition?.form_fields?.companions?.max || 4;
    if (companions.length < max) {
      setCompanions([...companions, { name: "", name_kana: "", company: "" }]);
    }
  }

  function updateCompanion(index: number, field: keyof Companion, value: string) {
    setCompanions((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)),
    );
  }

  function removeCompanion(index: number) {
    setCompanions((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: params.slug,
          ...form,
          companions,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "登録に失敗しました");
        return;
      }

      setTicketCode(data.ticket_code);
    } catch {
      setError("ネットワークエラーが発生しました");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-500">読み込み中...</div>
      </div>
    );
  }

  if (!exhibition) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            展示会が見つかりません
          </h1>
          <p className="text-gray-500">
            URLが正しいかご確認ください
          </p>
        </div>
      </div>
    );
  }

  // 登録完了画面
  if (ticketCode) {
    return (
      <div className="min-h-screen py-12 px-4">
        <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="text-green-500 text-5xl mb-4">&#10003;</div>
          <h1 className="text-2xl font-bold mb-2">登録完了</h1>
          <p className="text-gray-600 mb-6">
            {exhibition.name}への事前登録が完了しました
          </p>
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-500 mb-1">チケットコード</p>
            <p className="text-3xl font-mono font-bold tracking-wider">
              {ticketCode}
            </p>
          </div>
          <a
            href={`/${params.slug}/ticket/${ticketCode}`}
            className="inline-block rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700 transition"
          >
            QRチケットを表示
          </a>
        </div>
      </div>
    );
  }

  const ff = exhibition.form_fields;
  const branding = exhibition.branding;

  return (
    <div
      className="min-h-screen py-8 px-4"
      style={{ background: `linear-gradient(135deg, ${branding.primary_color}10, ${branding.secondary_color}10)` }}
    >
      <div className="max-w-2xl mx-auto">
        {/* ヘッダー */}
        <div
          className="rounded-t-2xl p-8 text-white text-center"
          style={{ backgroundColor: branding.primary_color }}
        >
          <h1 className="text-2xl font-bold mb-2">{exhibition.name}</h1>
          <p className="opacity-90">
            {exhibition.start_date} 〜 {exhibition.end_date}
          </p>
          {exhibition.venue_name && (
            <p className="opacity-80 text-sm mt-1">{exhibition.venue_name}</p>
          )}
          <p className="mt-4 text-lg">事前来場登録</p>
        </div>

        {/* フォーム */}
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-b-2xl shadow-lg p-8 space-y-6"
        >
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* 登録種別 */}
          {regTypes.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                登録種別 <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-3 flex-wrap">
                {regTypes
                  .filter((t) => !t.requires_code)
                  .map((t) => (
                    <button
                      key={t.slug}
                      type="button"
                      onClick={() =>
                        updateForm("registration_type_slug", t.slug)
                      }
                      className={`px-4 py-2 rounded-lg border-2 transition ${
                        form.registration_type_slug === t.slug
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      {t.name}
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* 必須: メール・氏名 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                メールアドレス <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => updateForm("email", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="example@company.co.jp"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                姓 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={form.last_name}
                onChange={(e) => updateForm("last_name", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={form.first_name}
                onChange={(e) => updateForm("first_name", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                セイ
              </label>
              <input
                type="text"
                value={form.last_name_kana}
                onChange={(e) => updateForm("last_name_kana", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="カタカナ"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                メイ
              </label>
              <input
                type="text"
                value={form.first_name_kana}
                onChange={(e) => updateForm("first_name_kana", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="カタカナ"
              />
            </div>
          </div>

          {/* 会社情報 */}
          {ff.company_name?.visible && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                会社名{" "}
                {ff.company_name.required && (
                  <span className="text-red-500">*</span>
                )}
              </label>
              <input
                type="text"
                required={ff.company_name.required}
                value={form.company_name}
                onChange={(e) => updateForm("company_name", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          )}

          {ff.company_kana?.visible && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                会社名（カナ）{" "}
                {ff.company_kana.required && (
                  <span className="text-red-500">*</span>
                )}
              </label>
              <input
                type="text"
                required={ff.company_kana.required}
                value={form.company_kana}
                onChange={(e) => updateForm("company_kana", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ff.department?.visible && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  部署
                </label>
                <input
                  type="text"
                  value={form.department}
                  onChange={(e) => updateForm("department", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            )}
            {ff.position?.visible && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  役職
                </label>
                <input
                  type="text"
                  value={form.position}
                  onChange={(e) => updateForm("position", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            )}
          </div>

          {ff.phone?.visible && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                電話番号
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => updateForm("phone", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="03-1234-5678"
              />
            </div>
          )}

          {/* 業種 */}
          {ff.industry?.visible && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                業種
              </label>
              <select
                value={form.industry}
                onChange={(e) => updateForm("industry", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">選択してください</option>
                {exhibition.industry_options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 来場目的 */}
          {ff.visit_purpose?.visible && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                来場目的（複数選択可）
              </label>
              <div className="flex flex-wrap gap-2">
                {exhibition.purpose_options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => togglePurpose(opt)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition ${
                      form.visit_purpose.includes(opt)
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* セミナー */}
          {exhibition.features.seminar && seminars.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                セミナー申込（複数選択可）
              </label>
              <div className="space-y-2">
                {seminars.map((s) => (
                  <label
                    key={s.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                      form.seminar_ids.includes(s.id)
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={form.seminar_ids.includes(s.id)}
                      onChange={() => toggleSeminar(s.id)}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-medium">{s.title}</div>
                      <div className="text-sm text-gray-500">
                        {new Date(s.starts_at).toLocaleString("ja-JP", {
                          month: "long",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        〜{" "}
                        {new Date(s.ends_at).toLocaleString("ja-JP", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {s.venue_name && ` / ${s.venue_name}`}
                      </div>
                      {s.speaker_name && (
                        <div className="text-sm text-gray-400">
                          {s.speaker_name}
                          {s.speaker_title && ` (${s.speaker_title})`}
                        </div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* 同伴者 */}
          {ff.companions?.visible && exhibition.features.companion && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                同伴者
              </label>
              {companions.map((c, i) => (
                <div
                  key={i}
                  className="flex gap-2 items-start mb-2 p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      placeholder="氏名"
                      value={c.name}
                      onChange={(e) =>
                        updateCompanion(i, "name", e.target.value)
                      }
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="text"
                      placeholder="会社名（任意）"
                      value={c.company || ""}
                      onChange={(e) =>
                        updateCompanion(i, "company", e.target.value)
                      }
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeCompanion(i)}
                    className="text-red-400 hover:text-red-600 p-1"
                  >
                    &#10005;
                  </button>
                </div>
              ))}
              {companions.length < (ff.companions.max || 4) && (
                <button
                  type="button"
                  onClick={addCompanion}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  + 同伴者を追加
                </button>
              )}
            </div>
          )}

          {/* 送信ボタン */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg py-3 text-white font-bold text-lg transition disabled:opacity-50"
            style={{ backgroundColor: branding.primary_color }}
          >
            {submitting ? "登録中..." : "事前登録する"}
          </button>

          {branding.copyright && (
            <p className="text-center text-xs text-gray-400 mt-4">
              {branding.copyright}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
