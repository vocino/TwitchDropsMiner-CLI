import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ConfigSchema, DEFAULT_CONFIG } from "./schema.js";
function configDir() {
    const dir = path.join(os.homedir(), ".config", "tdm");
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    return dir;
}
export function configPath() {
    return path.join(configDir(), "config.json");
}
export function loadConfig() {
    const p = configPath();
    if (!fs.existsSync(p)) {
        return DEFAULT_CONFIG;
    }
    try {
        const raw = fs.readFileSync(p, "utf8");
        return ConfigSchema.parse(JSON.parse(raw));
    }
    catch {
        return DEFAULT_CONFIG;
    }
}
export function saveConfig(config) {
    const p = configPath();
    fs.writeFileSync(p, JSON.stringify(ConfigSchema.parse(config), null, 2), { mode: 0o600 });
}
