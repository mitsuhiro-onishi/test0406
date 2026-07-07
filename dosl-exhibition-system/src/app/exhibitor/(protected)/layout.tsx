import Link from "next/link";
import { requireExhibitor } from "@/lib/exhibitor-auth";
import ExhibitorLogoutButton from "@/components/exhibitor/ExhibitorLogoutButton";

// 出展社向けページの共通レイアウト（リードリトリーバル・GATEオプション）
// ブース担当者がスマホで使う前提のシンプルなヘッダー構成

export const dynamic = "force-dynamic";

export default async function ExhibitorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const exhibitor = await requireExhibitor();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-gray-900 text-white">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <p className="font-bold">{exhibitor.name}</p>
            <p className="text-xs text-gray-400">
              {exhibitor.exhibition_name}
              {exhibitor.booth_number && ` ・ ブース ${exhibitor.booth_number}`}
            </p>
          </div>
          <ExhibitorLogoutButton />
        </div>
        <nav className="max-w-3xl mx-auto px-4 pb-2 flex gap-2">
          <Link
            href="/exhibitor"
            className="px-4 py-1.5 rounded-full text-sm bg-gray-800 text-gray-200 hover:bg-gray-700 transition"
          >
            スキャン
          </Link>
          <Link
            href="/exhibitor/leads"
            className="px-4 py-1.5 rounded-full text-sm bg-gray-800 text-gray-200 hover:bg-gray-700 transition"
          >
            リード一覧
          </Link>
        </nav>
      </header>
      <main className="flex-1 max-w-3xl mx-auto w-full">{children}</main>
    </div>
  );
}
