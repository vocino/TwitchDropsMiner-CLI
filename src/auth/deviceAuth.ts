import {
  TWITCH_DEVICE_FLOW_CLIENT_ID,
  TWITCH_OAUTH_DEVICE_URL,
  TWITCH_OAUTH_TOKEN_URL,
  getAndroidUserAgent
} from "../core/constants.js";
import { request } from "undici";

export interface DeviceCodeStart {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  interval: number;
  expiresIn: number;
}

interface DeviceStartResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  interval: number;
  expires_in: number;
}

interface TokenResponse {
  access_token: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function startDeviceAuth(): Promise<DeviceCodeStart> {
  // Twitch's device endpoint expects form-encoded parameters, not JSON.
  // Param name is `scopes` (upstream parity) — `scope` is not accepted.
  const body = new URLSearchParams({
    client_id: TWITCH_DEVICE_FLOW_CLIENT_ID,
    scopes: ""
  }).toString();

  const resp = await request(TWITCH_OAUTH_DEVICE_URL, {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Client-Id": TWITCH_DEVICE_FLOW_CLIENT_ID,
      "User-Agent": getAndroidUserAgent()
    }
  });

  const text = await resp.body.text();
  if (resp.statusCode < 200 || resp.statusCode >= 300) {
    throw new Error(`Device authorization request failed (HTTP ${resp.statusCode}): ${text.slice(0, 200)}`);
  }
  const response = JSON.parse(text) as Partial<DeviceStartResponse>;
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

export async function pollDeviceToken(start: DeviceCodeStart): Promise<string> {
  const expiresAt = Date.now() + start.expiresIn * 1000;
  while (Date.now() < expiresAt) {
    await sleep(start.interval * 1000);
    try {
      const body = new URLSearchParams({
        client_id: TWITCH_DEVICE_FLOW_CLIENT_ID,
        device_code: start.deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code"
      }).toString();

      const resp = await request(TWITCH_OAUTH_TOKEN_URL, {
        method: "POST",
        body,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Client-Id": TWITCH_DEVICE_FLOW_CLIENT_ID,
          "User-Agent": getAndroidUserAgent()
        }
      });

      const text = await resp.body.text();
      const tokenResp = JSON.parse(text) as Partial<TokenResponse>;
      if (tokenResp.access_token) {
        return tokenResp.access_token;
      }
    } catch {
      // expected while pending authorization
    }
  }
  throw new Error("Device authorization timed out.");
}

