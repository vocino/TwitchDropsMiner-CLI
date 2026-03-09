import { loadAuthState, saveAuthState } from "../state/authStore.js";
import { httpJson } from "../integrations/httpClient.js";
import { TWITCH_OAUTH_VALIDATE_URL } from "../core/constants.js";
import { parseTokenInput } from "./tokenImport.js";

interface ValidateResponse {
  client_id: string;
  user_id: string;
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

