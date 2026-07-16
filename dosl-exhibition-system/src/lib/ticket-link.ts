import { createHmac, timingSafeEqual } from "node:crypto";

const MIN_SECRET_BYTES = 32;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_LINK_LIFETIME_MS = 400 * ONE_DAY_MS;
const AFTER_EVENT_GRACE_MS = 7 * ONE_DAY_MS;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface TicketLinkClaims {
  slug: string;
  code: string;
  expires: number;
  registrationUpdatedAt: string;
}

interface SignedTicketUrlInput extends TicketLinkClaims {
  baseUrl: string;
}

function claimsPayload(claims: TicketLinkClaims): string {
  return JSON.stringify([
    "dosl-gate-ticket-v1",
    claims.slug,
    claims.code,
    claims.expires,
    claims.registrationUpdatedAt,
  ]);
}

export function isUsableTicketLinkSecret(secret: string | undefined): secret is string {
  return typeof secret === "string" && Buffer.byteLength(secret, "utf8") >= MIN_SECRET_BYTES;
}

export function getTicketLinkSecret(): string | null {
  const secret = process.env.TICKET_LINK_SECRET;
  return isUsableTicketLinkSecret(secret) ? secret : null;
}

export function isTicketLinkSignature(value: unknown): value is string {
  return typeof value === "string" && SIGNATURE_PATTERN.test(value);
}

export function createTicketLinkSignature(
  claims: TicketLinkClaims,
  secret: string,
): string {
  if (!isUsableTicketLinkSecret(secret)) {
    throw new Error("TICKET_LINK_SECRET must be at least 32 bytes");
  }
  return createHmac("sha256", secret)
    .update(claimsPayload(claims))
    .digest("base64url");
}

export function verifyTicketLinkSignature(
  claims: TicketLinkClaims,
  signature: unknown,
  secret: string,
  nowMs = Date.now(),
): boolean {
  if (
    !isUsableTicketLinkSecret(secret) ||
    !isTicketLinkSignature(signature) ||
    !Number.isSafeInteger(claims.expires) ||
    claims.expires <= Math.floor(nowMs / 1000)
  ) {
    return false;
  }

  const expected = createTicketLinkSignature(claims, secret);
  const actualBuffer = Buffer.from(signature, "ascii");
  const expectedBuffer = Buffer.from(expected, "ascii");
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

/** Link remains usable through the event and a short post-event grace period. */
export function getTicketLinkExpiry(endDate: string, nowMs = Date.now()): number {
  const eventEndMs = Date.parse(`${endDate}T23:59:59+09:00`);
  const desiredMs = Number.isFinite(eventEndMs)
    ? Math.max(nowMs + ONE_DAY_MS, eventEndMs + AFTER_EVENT_GRACE_MS)
    : nowMs + ONE_DAY_MS;
  return Math.floor(Math.min(desiredMs, nowMs + MAX_LINK_LIFETIME_MS) / 1000);
}

export function buildSignedTicketUrl(
  input: SignedTicketUrlInput,
  secret: string,
): string {
  const url = new URL(
    `/${encodeURIComponent(input.slug)}/ticket/${encodeURIComponent(input.code)}`,
    input.baseUrl,
  );
  url.searchParams.set("expires", String(input.expires));
  url.searchParams.set("signature", createTicketLinkSignature(input, secret));
  return url.toString();
}

