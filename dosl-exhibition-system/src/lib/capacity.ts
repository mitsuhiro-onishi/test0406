export type CapacityScope = "exhibition" | "seminar";

/** Matches the stable error raised by the atomic DB capacity triggers. */
export function isCapacityError(
  error: unknown,
  scope: CapacityScope,
): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: unknown; message?: unknown };
  return (
    value.code === "P0001" &&
    typeof value.message === "string" &&
    value.message.includes(`${scope}_capacity_reached`)
  );
}

