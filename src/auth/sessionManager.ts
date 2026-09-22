import { loadAuthState, saveAuthState } from "../state/authStore.js";
import type { AuthState } from "../state/authStore.js";
import { httpJson } from "../integrations/httpClient.js";
import { TWITCH_ANDROID_CLIENT_ID, TWITCH_OAUTH_VALIDATE_URL } from "../core/constants.js";
import { parseTokenInput } from "./tokenImport.js";

/**
 * Client-Id header API calls must present. Twitch enforces token<->client
 * binding, so this follows the stored binding recorded at login/import (or
 * miner startup) and falls back to the legacy Android ID for old states.
 */
export function selectApiClientId(state: AuthState | null): string {
  const bound = state?.tokenClientId?.trim();
  return bound ? bound : TWITCH_ANDROID_CLIENT_ID;
}

export function getApiClientId(): string {
  return selectApiClientId(loadAuthState());
}

interface ValidateResponse {
  client_id: string;
  user_id: string;
  login: string;
}

export class SessionManager {
  getAccessToken(): string | null {
    const state = loadAuthState();
    return state?.accessToken ?? null;
  }

  setAccessToken(rawTokenInput: string): void {
    const token = parseTokenInput(rawTokenInput).accessToken;
    const prev = loadAuthState() ?? { updatedAt: new Date().toISOString() };
    saveAuthState({
      ...prev,
      accessToken: token
    });
  }

  async validateAccessToken(token?: string): Promise<ValidateResponse> {
    const accessToken = token ?? this.getAccessToken();
    if (!accessToken) {
      throw new Error("No access token available.");
    }
    return httpJson<ValidateResponse>("GET", TWITCH_OAUTH_VALIDATE_URL, undefined, {
      retries: 1,
      headers: {
        Authorization: `OAuth ${accessToken}`
      }
    });
  }
}

