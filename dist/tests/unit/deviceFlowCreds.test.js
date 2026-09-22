import test from "node:test";
import assert from "node:assert/strict";
import { resolveDeviceFlowCredentials } from "../../auth/deviceAuth.js";
import { TWITCH_DEVICE_FLOW_CLIENT_ID } from "../../core/constants.js";
test("resolveDeviceFlowCredentials prefers the user's own app", () => {
    const creds = resolveDeviceFlowCredentials({
        oauthClientId: "  my-own-id ",
        oauthClientSecret: " s3cret "
    });
    assert.equal(creds.clientId, "my-own-id");
    assert.equal(creds.clientSecret, "s3cret");
});
test("resolveDeviceFlowCredentials falls back to the built-in client", () => {
    const creds = resolveDeviceFlowCredentials({ oauthClientId: "", oauthClientSecret: "" });
    assert.equal(creds.clientId, TWITCH_DEVICE_FLOW_CLIENT_ID);
    assert.equal(creds.clientSecret, "");
});
