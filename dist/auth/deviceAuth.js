import { TWITCH_DEVICE_FLOW_CLIENT_ID, TWITCH_OAUTH_DEVICE_URL, TWITCH_OAUTH_TOKEN_URL, getAndroidUserAgent } from "../core/constants.js";
import { loadConfig } from "../config/store.js";
/**
 * OAuth client for the device-code flow. Users bring their own Twitch app
 * (config oauthClientId/oauthClientSecret); the built-in first-party ID is
 * only a fallback for the authorize step and yields tokens Twitch's GQL
 * integrity gate rejects for mining. Never log either value.
 */
export function resolveDeviceFlowCredentials(cfg = loadConfig()) {
    const clientId = cfg.oauthClientId?.trim() || TWITCH_DEVICE_FLOW_CLIENT_ID;
    return { clientId, clientSecret: cfg.oauthClientSecret?.trim() ?? "" };
}
import { request } from "undici";
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export async function startDeviceAuth() {
    // Twitch's device endpoint expects form-encoded parameters, not JSON.
    // Param name is `scopes` (upstream parity) — `scope` is not accepted.
    const { clientId } = resolveDeviceFlowCredentials();
    const body = new URLSearchParams({
        client_id: clientId,
        scopes: ""
    }).toString();
    const resp = await request(TWITCH_OAUTH_DEVICE_URL, {
        method: "POST",
        body,
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Client-Id": clientId,
            "User-Agent": getAndroidUserAgent()
        }
    });
    const text = await resp.body.text();
    if (resp.statusCode < 200 || resp.statusCode >= 300) {
        throw new Error(`Device authorization request failed (HTTP ${resp.statusCode}): ${text.slice(0, 200)}`);
    }
    const response = JSON.parse(text);
    if (!response.device_code || !response.user_code || !response.verification_uri) {
        throw new Error(`Device authorization returned an unexpected body: ${text.slice(0, 200)}`);
    }
    return {
        deviceCode: response.device_code,
        userCode: response.user_code,
        verificationUri: response.verification_uri,
        interval: response.interval ?? 5,
        expiresIn: response.expires_in ?? 1800
    };
}
export async function pollDeviceToken(start) {
    const { clientId, clientSecret } = resolveDeviceFlowCredentials();
    const expiresAt = Date.now() + start.expiresIn * 1000;
    while (Date.now() < expiresAt) {
        await sleep(start.interval * 1000);
        try {
            const params = {
                client_id: clientId,
                device_code: start.deviceCode,
                grant_type: "urn:ietf:params:oauth:grant-type:device_code"
            };
            // Confidential (user-registered) apps must authenticate the exchange.
            if (clientSecret) {
                params.client_secret = clientSecret;
            }
            const body = new URLSearchParams(params).toString();
            const resp = await request(TWITCH_OAUTH_TOKEN_URL, {
                method: "POST",
                body,
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Client-Id": clientId,
                    "User-Agent": getAndroidUserAgent()
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
