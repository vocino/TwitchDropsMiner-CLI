import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
function getStateDir() {
    const xdg = process.env.XDG_STATE_HOME;
    const base = xdg ? path.join(xdg, "tdm") : path.join(os.homedir(), ".local", "state", "tdm");
    if (!fs.existsSync(base)) {
        fs.mkdirSync(base, { recursive: true, mode: 0o700 });
    }
    return base;
}
function getDevicePath() {
    return path.join(getStateDir(), "device.json");
}
function randomHex(len) {
    return crypto.randomBytes(Math.ceil(len / 2)).toString("hex").slice(0, len);
}
export function loadDeviceState() {
    const file = getDevicePath();
    if (!fs.existsSync(file))
        return null;
    try {
        const raw = fs.readFileSync(file, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed.deviceId && parsed.sessionId)
            return parsed;
        return null;
    }
    catch {
        return null;
    }
}
export function getOrCreateDeviceState() {
    const existing = loadDeviceState();
    if (existing)
        return existing;
    const state = {
        deviceId: randomHex(32),
        sessionId: randomHex(16),
        createdAt: new Date().toISOString()
    };
    saveDeviceState(state);
    return state;
}
export function saveDeviceState(state) {
    const file = getDevicePath();
    const payload = {
        deviceId: state.deviceId,
        sessionId: state.sessionId,
        createdAt: state.createdAt ?? new Date().toISOString()
    };
    fs.writeFileSync(file, JSON.stringify(payload, null, 2), { mode: 0o600 });
}
export function deviceHeaders() {
    const d = getOrCreateDeviceState();
    return {
        "X-Device-Id": d.deviceId,
        "Client-Session-Id": d.sessionId
    };
}
