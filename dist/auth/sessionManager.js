import { loadAuthState, saveAuthState } from "../state/authStore.js";
import { httpJson } from "../integrations/httpClient.js";
import { TWITCH_OAUTH_VALIDATE_URL } from "../core/constants.js";
import { parseTokenInput } from "./tokenImport.js";
export class SessionManager {
    getAccessToken() {
        const state = loadAuthState();
        return state?.accessToken ?? null;
    }
    setAccessToken(rawTokenInput) {
        const token = parseTokenInput(rawTokenInput).accessToken;
        const prev = loadAuthState() ?? { updatedAt: new Date().toISOString() };
        saveAuthState({
            ...prev,
            accessToken: token
        });
    }
    async validateAccessToken(token) {
        const accessToken = token ?? this.getAccessToken();
        if (!accessToken) {
            throw new Error("No access token available.");
        }
        return httpJson("GET", TWITCH_OAUTH_VALIDATE_URL, undefined, {
            retries: 1,
            headers: {
                Authorization: `OAuth ${accessToken}`
            }
        });
    }
}
