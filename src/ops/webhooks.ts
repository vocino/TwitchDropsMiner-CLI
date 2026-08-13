import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { logger } from "../core/runtime.js";
import { loadConfig, saveConfig } from "../config/store.js";

export interface WebhookHooks {
  onClaim?: string;
  onProgress?: string;
  onChannelSwitch?: string;
  onError?: string;
}

export interface WebhookEvent {
  type: "claim" | "progress" | "channel_switch" | "error" | "watch_tick";
  ts: string;
  game?: string;
  channelLogin?: string;
  channelId?: string;
  dropName?: string;
  dropId?: string;
  message?: string;
  data?: Record<string, unknown>;
}

function stateDir(): string {
  const dir = path.join(os.homedir(), ".local", "state", "tdm");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function hooksPath(): string {
  return path.join(stateDir(), "hooks.json");
}

export function loadHooks(): WebhookHooks {
  // primary: config.json webhooks, fallback: hooks.json legacy
  try {
    const cfg = loadConfig();
    const wh = (cfg as any).webhooks as WebhookHooks | undefined;
    if (wh && (wh.onClaim || wh.onProgress || wh.onChannelSwitch || wh.onError)) {
      return wh;
    }
  } catch {}
  try {
    const p = hooksPath();
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, "utf8")) as WebhookHooks;
  } catch {
    return {};
  }
}

export function saveHooks(hooks: WebhookHooks): void {
  fs.writeFileSync(hooksPath(), JSON.stringify(hooks, null, 2), { mode: 0o600 });
  // also persist to config.json for single-source truth
  try {
    const cfg = loadConfig() as any;
    cfg.webhooks = hooks;
    saveConfig(cfg);
  } catch {}
}

function renderTemplate(tmpl: string, event: WebhookEvent): string {
  return tmpl
    .replace(/\{\{\s*type\s*\}\}/g, event.type)
    .replace(/\{\{\s*game\s*\}\}/g, event.game ?? "")
    .replace(/\{\{\s*channelLogin\s*\}\}/g, event.channelLogin ?? "")
    .replace(/\{\{\s*channelId\s*\}\}/g, event.channelId ?? "")
    .replace(/\{\{\s*dropName\s*\}\}/g, event.dropName ?? "")
    .replace(/\{\{\s*drop\.name\s*\}\}/g, event.dropName ?? "")
    .replace(/\{\{\s*channel\.login\s*\}\}/g, event.channelLogin ?? "")
    .replace(/\{\{\s*message\s*\}\}/g, event.message ?? "")
    .replace(/\{\{\s*ts\s*\}\}/g, event.ts);
}

async function fireUrl(urlTpl: string, event: WebhookEvent): Promise<void> {
  const url = renderTemplate(urlTpl, event);
  if (!url) return;

  if (url.startsWith("exec:")) {
    const cmd = url.slice(5).trim();
    if (!cmd) return;
    // Use execFile semantics: we split cmd into file + args safely,
    // but keep shell features for templating — use execFile with shell=false
    // If cmd contains spaces, first token is binary, rest are args.
    // For complex shell, user should wrap in /bin/sh -c themselves — we still
    // avoid injection by not interpolating user input (only templated safe fields)
    try {
      const { spawn } = await import("node:child_process");
      const parts = cmd.split(/\s+/).filter(Boolean);
      const file = parts[0];
      const args = parts.slice(1);
      const child = spawn(file, args, { timeout: 10_000, detached: true, stdio: "ignore" });
      child.unref();
      child.on("error", (err) => logger.warn({ err, cmd }, "Webhook exec failed"));
    } catch {}
    return;
  }

  try {
    const body = JSON.stringify(event, null, 2);
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "tdm-webhook/0.4" },
      body
    });
  } catch (err) {
    logger.debug({ err, url }, "Webhook fire failed");
  }
}

let lastFireAt = new Map<string, number>();

function shouldThrottle(key: string, minIntervalMs = 10_000): boolean {
  const now = Date.now();
  const last = lastFireAt.get(key) ?? 0;
  if (now - last < minIntervalMs) return true;
  lastFireAt.set(key, now);
  return false;
}

export async function dispatchHook(
  eventType: WebhookEvent["type"],
  event: Omit<WebhookEvent, "type" | "ts"> & Partial<Pick<WebhookEvent, "ts">>
): Promise<void> {
  try {
    const hooks = loadHooks();
    const key = `${eventType}:${event.game ?? ""}:${event.channelLogin ?? ""}`;
    if (eventType === "progress" || eventType === "watch_tick") {
      if (shouldThrottle(key, eventType === "watch_tick" ? 60_000 : 5 * 60_000)) return;
    }

    const full: WebhookEvent = {
      type: eventType,
      ts: event.ts ?? new Date().toISOString(),
      game: event.game,
      channelLogin: event.channelLogin,
      channelId: event.channelId,
      dropName: event.dropName,
      dropId: event.dropId,
      message: event.message,
      data: event.data
    };

    const mapping: Record<string, string | undefined> = {
      claim: hooks.onClaim,
      progress: hooks.onProgress,
      channel_switch: hooks.onChannelSwitch,
      error: hooks.onError,
      watch_tick: hooks.onProgress
    };

    const target = mapping[eventType];
    if (!target) return;

    const urls = target
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const u of urls) {
      await fireUrl(u, full);
    }
  } catch {}
}
