import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

function getStateDir(): string {
  const xdg = process.env.XDG_STATE_HOME;
  const base = xdg ? path.join(xdg, "tdm") : path.join(os.homedir(), ".local", "state", "tdm");
  if (!fs.existsSync(base)) {
    fs.mkdirSync(base, { recursive: true, mode: 0o700 });
  }
  return base;
}

function getDevicePath(): string {
  return path.join(getStateDir(), "device.json");
}

export interface DeviceState {
  deviceId: string;
  sessionId: string;
  createdAt: string;
}

function randomHex(len: number): string {
  return crypto.randomBytes(Math.ceil(len / 2)).toString("hex").slice(0, len);
}

export function loadDeviceState(): DeviceState | null {
  const file = getDevicePath();
  if (!fs.existsSync(file)) return null;
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as DeviceState;
    if (parsed.deviceId && parsed.sessionId) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function getOrCreateDeviceState(): DeviceState {
  const existing = loadDeviceState();
  if (existing) return existing;
  const state: DeviceState = {
    deviceId: randomHex(32),
    sessionId: randomHex(16),
    createdAt: new Date().toISOString()
  };
  saveDeviceState(state);
  return state;
}

export function saveDeviceState(state: DeviceState): void {
  const file = getDevicePath();
  const payload: DeviceState = {
    deviceId: state.deviceId,
    sessionId: state.sessionId,
    createdAt: state.createdAt ?? new Date().toISOString()
  };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), { mode: 0o600 });
}

export function deviceHeaders(): Record<string, string> {
  const d = getOrCreateDeviceState();
  return {
    "X-Device-Id": d.deviceId,
    "Client-Session-Id": d.sessionId
  };
}
