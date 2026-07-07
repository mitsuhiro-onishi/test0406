import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import LogoutButton from "@/components/admin/LogoutButton";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdmin();

  return (
    <div className="min-h-screen flex">
      {/* サイドバー */}
      <aside className="w-64 bg-gray-900 text-white flex-shrink-0 flex flex-col">
        <div className="p-6">
          <h1 className="text-lg font-bold">DOSL Admin</h1>
          <p className="text-gray-400 text-xs mt-1">展示会管理システム</p>
        </div>
        <nav className="px-4 space-y-1 flex-1">
          <Link
            href="/admin/dashboard"
            className="block px-4 py-2.5 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition"
          >
            ダッシュボード
          </Link>
          <Link
            href="/admin/registrations"
            className="block px-4 py-2.5 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition"
          >
            登録者一覧
          </Link>
          <Link
            href="/admin/checkin"
            className="block px-4 py-2.5 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition"
          >
            受付（QR読取）
          </Link>
        </nav>

        {/* ユーザー情報 & ログアウト */}
        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{admin.display_name}</p>
              <p className="text-xs text-gray-400">{admin.role}</p>
            </div>
            <LogoutButton />
          </div>
        </div>
      </aside>

      {/* メインコンテンツ */}
      <main className="flex-1 bg-gray-50">{children}</main>
    </div>
  );
}
