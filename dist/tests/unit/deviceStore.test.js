import test from "node:test";
import assert from "node:assert/strict";
import { CaptchaRequiredError } from "../../integrations/httpClient.js";
import { getOrCreateDeviceState, loadDeviceState, deviceHeaders } from "../../state/deviceStore.js";
test("CaptchaRequiredError is flagged correctly", () => {
    const err = new CaptchaRequiredError("captcha challenge");
    assert.ok(err instanceof Error);
    assert.equal(err.name, "CaptchaRequiredError");
    assert.match(err.message.toLowerCase(), /captcha/);
});
test("device store generates persistent id and headers", () => {
    const state = getOrCreateDeviceState();
    assert.ok(state.deviceId.length >= 16);
    assert.ok(state.sessionId.length >= 8);
    const loaded = loadDeviceState();
    assert.ok(loaded);
    assert.equal(loaded?.deviceId, state.deviceId);
    const headers = deviceHeaders();
    assert.ok(headers["X-Device-Id"]);
    assert.ok(headers["Client-Session-Id"]);
    assert.equal(headers["X-Device-Id"], state.deviceId);
});
