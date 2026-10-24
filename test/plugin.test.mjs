// Offline test: answers come from test/fixtures.json (record it once with
//   node sdk/run.mjs --record test/fixtures.json . search "algo").
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "../sdk/validate.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = join(root, "test", "fixtures.json");

test("Kino accepts the manifest and the exports", async () => {
  const r = await validate(root);
  assert.deepEqual(r.problems, []);
});

test("search answers offline, and Kino drops nothing", { skip: !existsSync(fixtures) && "record test/fixtures.json first" }, async () => {
  const r = await validate(root, { run: "search", args: ["peron"], replay: fixtures });
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.drops, []);
  assert.ok(r.output.items.length > 0);
});
