import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  canManageAdminData,
  scopeExhibitions,
  type ScopeSession,
} from "../src/lib/admin-scope.ts";

const owner: ScopeSession = {
  role: "owner",
  organization_id: "org-a",
  exhibition_ids: null,
};
const admin: ScopeSession = { ...owner, role: "admin" };
const limitedStaff: ScopeSession = {
  role: "staff",
  organization_id: "org-a",
  exhibition_ids: ["a-2"],
};
const unassignedStaff: ScopeSession = {
  role: "staff",
  organization_id: "org-a",
  exhibition_ids: null,
};

const exhibitions = [
  { id: "a-1", organization_id: "org-a" },
  { id: "a-2", organization_id: "org-a" },
  { id: "b-1", organization_id: "org-b" },
];

test("owner/admin are limited to their organization", () => {
  assert.deepEqual(scopeExhibitions(exhibitions, owner).map((e) => e.id), [
    "a-1",
    "a-2",
  ]);
  assert.deepEqual(scopeExhibitions(exhibitions, admin).map((e) => e.id), [
    "a-1",
    "a-2",
  ]);
});

test("staff sees only explicitly assigned exhibitions", () => {
  assert.deepEqual(
    scopeExhibitions(exhibitions, limitedStaff).map((e) => e.id),
    ["a-2"],
  );
  assert.deepEqual(scopeExhibitions(exhibitions, unassignedStaff), []);
});

test("staff cannot mutate management data", () => {
  assert.equal(canManageAdminData(owner), true);
  assert.equal(canManageAdminData(admin), true);
  assert.equal(canManageAdminData(limitedStaff), false);
});

test("all service-role admin routes apply exhibition scope", () => {
  const routes = [
    "exhibitions/route.ts",
    "registrations/route.ts",
    "registrations/[id]/route.ts",
    "registrations/csv/route.ts",
    "exhibitors/route.ts",
    "exhibitors/[id]/route.ts",
    "seminars/route.ts",
    "seminars/[id]/route.ts",
    "seminars/checkin/route.ts",
    "seminars/[id]/bookings/route.ts",
    "seminars/[id]/bookings/csv/route.ts",
    "checkin/route.ts",
    "email/confirmation/route.ts",
  ];
  for (const route of routes) {
    const source = readFileSync(`src/app/api/${route}`, "utf8");
    assert.match(source, /getAuthorizedExhibitionIds/, route);
  }
});

test("management mutations require owner or admin", () => {
  const routes = [
    "registrations/[id]/route.ts",
    "exhibitors/route.ts",
    "exhibitors/[id]/route.ts",
    "seminars/route.ts",
    "seminars/[id]/route.ts",
    "email/confirmation/route.ts",
  ];
  for (const route of routes) {
    const source = readFileSync(`src/app/api/${route}`, "utf8");
    assert.match(source, /canManageAdminData/, route);
  }
});

test("admin session loads exhibition assignments", () => {
  const source = readFileSync("src/lib/auth.ts", "utf8");
  assert.match(source, /exhibition_ids/);
});
