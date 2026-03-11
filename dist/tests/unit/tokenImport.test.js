import test from "node:test";
import assert from "node:assert/strict";
import { parseTokenInput } from "../../auth/tokenImport.js";
test("parseTokenInput supports raw token", () => {
    const parsed = parseTokenInput("abc123");
    assert.equal(parsed.accessToken, "abc123");
    assert.equal(parsed.source, "raw");
});
test("parseTokenInput supports auth-token pair", () => {
    const parsed = parseTokenInput("auth-token=abc123");
    assert.equal(parsed.accessToken, "abc123");
    assert.equal(parsed.source, "auth-token");
});
