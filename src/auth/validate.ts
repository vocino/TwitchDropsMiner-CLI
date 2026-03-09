import { loadAuthState } from "../state/authStore.js";
import { SessionManager } from "./sessionManager.js";

export interface LocalValidationResult {
  hasToken: boolean;
  hasCookies: boolean;
}

export function validateAuthLocally(): LocalValidationResult {
  const state = loadAuthState();
  if (!state) {
    return { hasToken: false, hasCookies: false };
  }
  return {
    hasToken: !!state.accessToken,
    hasCookies: !!state.cookiesHeader
  };
}

export async function validateAuthRemote(): Promise<{
  valid: boolean;
  userId?: string;
  clientId?: string;
  error?: string;
}> {
  try {
    const session = new SessionManager();
    const validateResponse = await session.validateAccessToken();
    return {
      valid: true,
      userId: validateResponse.user_id,
      clientId: validateResponse.client_id
    };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

