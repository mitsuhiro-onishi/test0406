"use client";

import { useRouter } from "next/navigation";

export default function ExhibitorLogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/exhibitor/logout", { method: "POST" });
    router.push("/exhibitor/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="text-xs text-gray-400 hover:text-white transition"
    >
      ログアウト
    </button>
  );
}
