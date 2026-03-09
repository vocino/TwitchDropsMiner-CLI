import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface SessionState {
  state: string;
  updatedAt: string;
  watchedChannelId?: string;
  watchedChannelName?: string;
  activeDropId?: string;
}

function stateDir(): string {
  const dir = path.join(os.homedir(), ".local", "state", "tdm");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function sessionPath(): string {
  return path.join(stateDir(), "session.json");
}

export function loadSessionState(): SessionState | null {
  const p = sessionPath();
  if (!fs.existsSync(p)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as SessionState;
  } catch {
    return null;
  }
}

export function saveSessionState(next: SessionState): void {
  fs.writeFileSync(sessionPath(), JSON.stringify(next, null, 2), { mode: 0o600 });
}

