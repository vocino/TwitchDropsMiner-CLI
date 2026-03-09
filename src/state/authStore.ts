import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface AuthState {
  accessToken?: string;
  cookiesHeader?: string;
  updatedAt: string;
}

function getConfigDir(): string {
  const home = os.homedir();
  const dir = path.join(home, ".config", "tdm");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  return dir;
}

function getAuthFilePath(): string {
  return path.join(getConfigDir(), "auth.json");
}

export function loadAuthState(): AuthState | null {
  const file = getAuthFilePath();
  if (!fs.existsSync(file)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as AuthState;
    return parsed;
  } catch {
    return null;
  }
}

export function saveAuthState(state: AuthState): void {
  const file = getAuthFilePath();
  const payload: AuthState = {
    accessToken: state.accessToken,
    cookiesHeader: state.cookiesHeader,
    updatedAt: new Date().toISOString()
  };
  const json = JSON.stringify(payload, null, 2);
  fs.writeFileSync(file, json, { mode: 0o600 });
}

