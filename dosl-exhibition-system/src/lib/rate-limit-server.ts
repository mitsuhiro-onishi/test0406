import { createHash } from "node:crypto";
import { rateLimit, type RateLimitResult } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/server";

let fallbackWarningLogged = false;

/**
 * Consumes a rate-limit bucket shared by all application instances.
 *
 * Raw keys can contain IP addresses or account identifiers, so only a SHA-256
 * digest is sent to persistent storage. If the database function is not yet
 * available, the existing bounded in-memory limiter remains a fail-safe.
 */
export async function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const keyHash = createHash("sha256").update(key).digest("hex");
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));

  try {
    const { data, error } = await supabaseAdmin.rpc("consume_api_rate_limit", {
      p_key_hash: keyHash,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });

    const row = Array.isArray(data) ? data[0] : data;
    if (
      !error &&
      row &&
      typeof row.allowed === "boolean" &&
      typeof row.retry_after_sec === "number"
    ) {
      return {
        allowed: row.allowed,
        retryAfterSec: row.retry_after_sec,
      };
    }

    if (!fallbackWarningLogged) {
      fallbackWarningLogged = true;
      console.error("Distributed rate limiter unavailable; using local fallback", error);
    }
  } catch (error) {
    if (!fallbackWarningLogged) {
      fallbackWarningLogged = true;
      console.error("Distributed rate limiter failed; using local fallback", error);
    }
  }

  return rateLimit(key, limit, windowMs);
}

