import test from "node:test";
import assert from "node:assert/strict";
import { selectApiClientId } from "../../auth/sessionManager.js";
import { TWITCH_ANDROID_CLIENT_ID, TWITCH_WEB_CLIENT_ID } from "../../core/constants.js";
test("selectApiClientId follows the stored token binding", () => {
    assert.equal(selectApiClientId({ tokenClientId: TWITCH_WEB_CLIENT_ID, updatedAt: "" }), TWITCH_WEB_CLIENT_ID);
});
test("selectApiClientId falls back to Android ID without a binding", () => {
    assert.equal(selectApiClientId(null), TWITCH_ANDROID_CLIENT_ID);
    assert.equal(selectApiClientId({ updatedAt: "" }), TWITCH_ANDROID_CLIENT_ID);
    assert.equal(selectApiClientId({ tokenClientId: "  ", updatedAt: "" }), TWITCH_ANDROID_CLIENT_ID);
});
