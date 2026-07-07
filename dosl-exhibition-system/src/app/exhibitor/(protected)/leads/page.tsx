"use client";

import { useState, useEffect, useCallback } from "react";

// リード一覧（リードリトリーバル・GATEオプション）

interface LeadRow {
  id: string;
  note: string | null;
  scanned_at: string;
  registration: {
    id: string;
    ticket_code: string;
    industry: string | null;
    visit_purpose: string[] | null;
    visitor: {
      last_name: string;
      first_name: string;
      last_name_kana: string | null;
      first_name_kana: string | null;
      company_name: string | null;
      department: string | null;
      position: string | null;
      email: string;
      phone: string | null;
    };
  };
}

function jst(value: string): string {
  return new Date(value).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ExhibitorLeadsPage() {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/exhibitor/leads");
      const json = await res.json();
      setLeads(json.leads || []);
    } catch {
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  function toggleExpand(lead: LeadRow) {
    if (expanded === lead.id) {
      setExpanded(null);
    } else {
      setExpanded(lead.id);
      setNoteDraft(lead.note || "");
    }
  }

  async function saveNote(leadId: string) {
    setSavingNote(true);
    try {
      const res = await fetch(`/api/exhibitor/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: noteDraft }),
      });
      const data = await res.json();
      if (data.success) {
        setLeads((prev) =>
          prev.map((l) =>
            l.id === leadId ? { ...l, note: data.lead.note } : l,
          ),
        );
      } else {
        alert(data.error || "保存に失敗しました");
      }
    } catch {
      alert("ネットワークエラーが発生しました");
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">
          リード一覧
          <span className="text-sm text-gray-400 font-normal ml-2">
            {leads.length}件
          </span>
        </h1>
        <button
          onClick={() => window.open("/api/exhibitor/leads/csv", "_blank")}
          disabled={leads.length === 0}
          className="px-4 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 transition text-sm font-medium disabled:opacity-50"
        >
          CSV
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl shadow-sm p-10 text-center text-gray-400">
          読み込み中...
        </div>
      ) : leads.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-10 text-center text-gray-400">
          まだリードがありません。
          <br />
          スキャン画面から来場者のQRを読み取ってください
        </div>
      ) : (
        <div className="space-y-2">
          {leads.map((lead) => {
            const v = lead.registration.visitor;
            const isOpen = expanded === lead.id;
            return (
              <div
                key={lead.id}
                className="bg-white rounded-xl shadow-sm overflow-hidden"
              >
                <button
                  onClick={() => toggleExpand(lead)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-bold">
                      {v.last_name} {v.first_name}
                      {lead.note && (
                        <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                          メモ
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-gray-500 truncate">
                      {v.company_name || "-"}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-gray-400">
                      {jst(lead.scanned_at)}
                    </p>
                    <span className="text-gray-300">{isOpen ? "▲" : "▼"}</span>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t px-4 py-3 space-y-2 text-sm">
                    <dl className="grid grid-cols-3 gap-y-1.5">
                      <dt className="text-gray-400">部署 / 役職</dt>
                      <dd className="col-span-2">
                        {[v.department, v.position].filter(Boolean).join(" / ") ||
                          "-"}
                      </dd>
                      <dt className="text-gray-400">メール</dt>
                      <dd className="col-span-2 break-all">{v.email}</dd>
                      <dt className="text-gray-400">電話</dt>
                      <dd className="col-span-2">{v.phone || "-"}</dd>
                      <dt className="text-gray-400">業種</dt>
                      <dd className="col-span-2">
                        {lead.registration.industry || "-"}
                      </dd>
                      <dt className="text-gray-400">来場目的</dt>
                      <dd className="col-span-2">
                        {lead.registration.visit_purpose?.join("、") || "-"}
                      </dd>
                    </dl>

                    <div className="pt-2">
                      <label className="block text-gray-400 mb-1">
                        商談メモ
                      </label>
                      <textarea
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        maxLength={500}
                        rows={3}
                        placeholder="興味のあった製品、フォロー予定など"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:border-blue-500"
                      />
                      <div className="flex justify-end mt-2">
                        <button
                          onClick={() => saveNote(lead.id)}
                          disabled={savingNote}
                          className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
                        >
                          {savingNote ? "保存中..." : "メモを保存"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
