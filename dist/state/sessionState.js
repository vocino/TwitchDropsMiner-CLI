import fs from "node:fs";
import os from "node:os";
import path from "node:path";
function stateDir() {
    const dir = path.join(os.homedir(), ".local", "state", "tdm");
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    return dir;
}
function sessionPath() {
    return path.join(stateDir(), "session.json");
}
export function loadSessionState() {
    const p = sessionPath();
    if (!fs.existsSync(p)) {
        return null;
    }
    try {
        return JSON.parse(fs.readFileSync(p, "utf8"));
    }
    catch {
        return null;
    }
}
export function saveSessionState(next) {
    fs.writeFileSync(sessionPath(), JSON.stringify(next, null, 2), { mode: 0o600 });
}
