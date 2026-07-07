import { NextRequest } from "next/server";

// インメモリ固定ウィンドウ方式のレート制限。
// サーバーレス環境ではインスタンスごとのカウントになるため厳密ではないが、
// ブルートフォース・スパム登録への基礎的な防壁として機能する。
// 厳密な制限が必要になったら Upstash 等の外部ストアに置き換える。

interface WindowEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, WindowEntry>();
const MAX_BUCKETS = 10_000;

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const entry = buckets.get(key);

  if (!entry || entry.resetAt <= now) {
    // 肥大化防止: 上限を超えたら期限切れエントリを掃除
    if (buckets.size >= MAX_BUCKETS) {
      buckets.forEach((v, k) => {
        if (v.resetAt <= now) buckets.delete(k);
      });
      if (buckets.size >= MAX_BUCKETS) buckets.clear();
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }

  entry.count++;
  if (entry.count > limit) {
    return {
      allowed: false,
      retryAfterSec: Math.ceil((entry.resetAt - now) / 1000),
    };
  }
  return { allowed: true, retryAfterSec: 0 };
}

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.ip || "unknown";
}
