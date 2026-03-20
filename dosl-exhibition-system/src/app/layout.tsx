import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DOSL Exhibition Registration",
  description: "展示会事前登録システム",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}
