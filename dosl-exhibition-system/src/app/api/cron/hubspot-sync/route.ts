import { NextRequest, NextResponse } from "next/server";
import { isHubspotSyncEnabled, syncToHubspot } from "@/lib/hubspot";

// HubSpot CRM同期cron（Phase 1）
// - Vercel cron（vercel.json）から1日1回GETで起動される
// - HUBSPOT_SYNC_ENABLED=true でない限り何もしない（既存機能への影響ゼロ）
// - CRON_SECRET 設定時は Authorization: Bearer <CRON_SECRET> を要求
//   （Vercel cronはCRON_SECRET環境変数があると自動で付与する）
// - 手動実行: curl -H "Authorization: Bearer $CRON_SECRET" \
//     "https://<host>/api/cron/hubspot-sync?full=1"  ← full=1 で全件同期

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { success: false, error: "認証エラー" },
        { status: 401 },
      );
    }
  }

  if (!isHubspotSyncEnabled()) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: "HUBSPOT_SYNC_ENABLED が true でないため同期をスキップしました",
    });
  }

  // 本番で同期を有効化する場合はCRON_SECRETを必須にする
  // （未設定だと誰でもこのエンドポイントを叩けてしまうため）
  if (!cronSecret && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      {
        success: false,
        error:
          "CRON_SECRET が未設定です。本番で同期を有効化する場合は必ず設定してください",
      },
      { status: 500 },
    );
  }

  const full = request.nextUrl.searchParams.get("full") === "1";
  try {
    const result = await syncToHubspot(full);
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    console.error("HubSpot同期エラー:", e);
    return NextResponse.json(
      {
        success: false,
        error: e instanceof Error ? e.message : "HubSpot同期に失敗しました",
      },
      { status: 500 },
    );
  }
}
