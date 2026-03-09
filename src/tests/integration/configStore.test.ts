import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../../config/store.js";

test("loadConfig returns defaults when config missing/invalid", () => {
  const cfg = loadConfig();
  assert.ok(cfg);
  assert.equal(typeof cfg.connectionQuality, "number");
});

