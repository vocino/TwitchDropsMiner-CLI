import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function cookieDir(): string {
  const dir = path.join(os.homedir(), ".config", "tdm");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function cookiePath(): string {
  return path.join(cookieDir(), "cookies.txt");
}

export function loadCookieHeader(): string | null {
  const p = cookiePath();
  if (!fs.existsSync(p)) {
    return null;
  }
  return fs.readFileSync(p, "utf8").trim() || null;
}

export function saveCookieHeader(cookieHeader: string): void {
  fs.writeFileSync(cookiePath(), cookieHeader, { mode: 0o600 });
}

