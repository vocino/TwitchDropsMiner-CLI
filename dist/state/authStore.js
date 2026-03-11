import fs from "node:fs";
import path from "node:path";
import os from "node:os";
function getConfigDir() {
    const home = os.homedir();
    const dir = path.join(home, ".config", "tdm");
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    return dir;
}
function getAuthFilePath() {
    return path.join(getConfigDir(), "auth.json");
}
export function loadAuthState() {
    const file = getAuthFilePath();
    if (!fs.existsSync(file)) {
        return null;
    }
    try {
        const raw = fs.readFileSync(file, "utf8");
        const parsed = JSON.parse(raw);
        return parsed;
    }
    catch {
        return null;
    }
}
export function saveAuthState(state) {
    const file = getAuthFilePath();
    const payload = {
        accessToken: state.accessToken,
        cookiesHeader: state.cookiesHeader,
        updatedAt: new Date().toISOString()
    };
    const json = JSON.stringify(payload, null, 2);
    fs.writeFileSync(file, json, { mode: 0o600 });
}
