export type AdminRole = "owner" | "admin" | "staff";

export interface ScopeSession {
  role: AdminRole;
  organization_id: string;
  exhibition_ids: string[] | null;
}

export function canManageAdminData(session: ScopeSession): boolean {
  return session.role === "owner" || session.role === "admin";
}

export function canAccessExhibition(
  session: ScopeSession,
  exhibition: { id: string; organization_id: string },
): boolean {
  if (exhibition.organization_id !== session.organization_id) return false;
  if (session.role !== "staff") return true;
  return (session.exhibition_ids || []).includes(exhibition.id);
}

export function scopeExhibitions<
  T extends { id: string; organization_id: string },
>(exhibitions: T[], session: ScopeSession): T[] {
  return exhibitions.filter((exhibition) =>
    canAccessExhibition(session, exhibition),
  );
}
