import { TWITCH_ANDROID_CLIENT_ID, TWITCH_ANDROID_USER_AGENT, TWITCH_OAUTH_DEVICE_URL, TWITCH_OAUTH_TOKEN_URL } from "../core/constants.js";
import { request } from "undici";
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export async function startDeviceAuth() {
    // Twitch's device endpoint expects form-encoded parameters, not JSON.
    const body = new URLSearchParams({
        client_id: TWITCH_ANDROID_CLIENT_ID,
        scope: ""
    }).toString();
    const resp = await request(TWITCH_OAUTH_DEVICE_URL, {
        method: "POST",
        body,
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Client-Id": TWITCH_ANDROID_CLIENT_ID,
            "User-Agent": TWITCH_ANDROID_USER_AGENT
        }
    });
    const text = await resp.body.text();
    const response = JSON.parse(text);
    return {
        deviceCode: response.device_code,
        userCode: response.user_code,
        verificationUri: response.verification_uri,
        interval: response.interval,
        expiresIn: response.expires_in
    };
}
export async function pollDeviceToken(start) {
    const expiresAt = Date.now() + start.expiresIn * 1000;
    while (Date.now() < expiresAt) {
        await sleep(start.interval * 1000);
        try {
            const body = new URLSearchParams({
                client_id: TWITCH_ANDROID_CLIENT_ID,
                device_code: start.deviceCode,
                grant_type: "urn:ietf:params:oauth:grant-type:device_code"
            }).toString();
            const resp = await request(TWITCH_OAUTH_TOKEN_URL, {
                method: "POST",
                body,
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Client-Id": TWITCH_ANDROID_CLIENT_ID,
                    "User-Agent": TWITCH_ANDROID_USER_AGENT
                }
            });
            const text = await resp.body.text();
            const tokenResp = JSON.parse(text);
            if (tokenResp.access_token) {
                return tokenResp.access_token;
            }
        }
        catch {
            // expected while pending authorization
        }
    }
    throw new Error("Device authorization timed out.");
}
