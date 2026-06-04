import test from "node:test";
import assert from "node:assert/strict";
import { compareSemver, normalizeVersionTag } from "../app-update.js";

test("normalizes release tags before comparison", () => {
  assert.equal(normalizeVersionTag("v1.0.1"), "1.0.1");
  assert.equal(normalizeVersionTag("V2.3.4"), "2.3.4");
});

test("compares GitHub release semver against local package version", () => {
  assert.equal(compareSemver("v1.0.1", "1.0.0"), 1);
  assert.equal(compareSemver("1.0.0", "1.0.0"), 0);
  assert.equal(compareSemver("0.9.9", "1.0.0"), -1);
});
