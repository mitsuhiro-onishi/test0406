import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-4">
          DOSL Exhibition Registration
        </h1>
        <p className="text-gray-600 mb-8">展示会事前登録プラットフォーム</p>
        <div className="space-x-4">
          <Link
            href="/sample-exhibition-2026/register"
            className="inline-block rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700 transition"
          >
            サンプル展示会に登録
          </Link>
          <Link
            href="/admin/dashboard"
            className="inline-block rounded-lg border border-gray-300 px-6 py-3 text-gray-700 hover:bg-gray-100 transition"
          >
            管理画面
          </Link>
        </div>
      </div>
    </div>
  );
}
