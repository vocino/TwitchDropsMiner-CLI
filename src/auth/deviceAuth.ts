import {
  TWITCH_ANDROID_CLIENT_ID,
  TWITCH_ANDROID_USER_AGENT,
  TWITCH_OAUTH_DEVICE_URL,
  TWITCH_OAUTH_TOKEN_URL
} from "../core/constants.js";
import { httpJson } from "../integrations/httpClient.js";

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
  const response = await httpJson<DeviceStartResponse>(
    "POST",
    TWITCH_OAUTH_DEVICE_URL,
    {
      client_id: TWITCH_ANDROID_CLIENT_ID,
      scopes: ""
    },
    {
      headers: {
        "Client-Id": TWITCH_ANDROID_CLIENT_ID,
        "User-Agent": TWITCH_ANDROID_USER_AGENT
      }
    }
  );

  return {
    deviceCode: response.device_code,
    userCode: response.user_code,
    verificationUri: response.verification_uri,
    interval: response.interval,
    expiresIn: response.expires_in
  };
}

export async function pollDeviceToken(start: DeviceCodeStart): Promise<string> {
  const expiresAt = Date.now() + start.expiresIn * 1000;
  while (Date.now() < expiresAt) {
    await sleep(start.interval * 1000);
    try {
      const tokenResp = await httpJson<TokenResponse>(
        "POST",
        TWITCH_OAUTH_TOKEN_URL,
        {
          client_id: TWITCH_ANDROID_CLIENT_ID,
          device_code: start.deviceCode,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code"
        },
        {
          headers: {
            "Client-Id": TWITCH_ANDROID_CLIENT_ID,
            "User-Agent": TWITCH_ANDROID_USER_AGENT
          }
        }
      );
      if (tokenResp.access_token) {
        return tokenResp.access_token;
      }
    } catch {
      // expected while pending authorization
    }
  }
  throw new Error("Device authorization timed out.");
}

