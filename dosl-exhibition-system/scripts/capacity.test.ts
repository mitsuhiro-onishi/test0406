import assert from "node:assert/strict";
import test from "node:test";
import { isCapacityError } from "../src/lib/capacity.ts";

test("DB定員エラーをscope別に識別する", () => {
  assert.equal(
    isCapacityError(
      { code: "P0001", message: "exhibition_capacity_reached" },
      "exhibition",
    ),
    true,
  );
  assert.equal(
    isCapacityError(
      { code: "P0001", message: "seminar_capacity_reached" },
      "seminar",
    ),
    true,
  );
  assert.equal(
    isCapacityError(
      { code: "P0001", message: "seminar_capacity_reached" },
      "exhibition",
    ),
    false,
  );
  assert.equal(
    isCapacityError(
      { code: "23505", message: "exhibition_capacity_reached" },
      "exhibition",
    ),
    false,
  );
});

