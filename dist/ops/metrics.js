/**
 * Prometheus metrics for tdm.
 *
 * Exposes twitch_drops_* metrics in text exposition format.
 * No extra deps — pure TS, http server optional.
 *
 * Metrics:
 * - twitch_drops_watching (gauge: 1 if watching else 0) labels: channel, channel_id, game
 * - twitch_drops_minutes_total (counter-ish gauge) labels: game
 * - twitch_drops_minutes_total_per_channel (counter) labels: channel
 * - twitch_drops_campaigns_total (gauge)
 * - twitch_drops_eligible_campaigns (gauge)
 * - twitch_drops_claimed_total (counter)
 * - twitch_drops_watch_ticks_total (counter) labels: channel, game   — total watch POST attempts
 * - twitch_drops_watch_errors_total (counter) labels: reason?
 * - twitch_drops_channel_switches_total (counter)
 * - twitch_drops_inventory_fetch_total (counter)
 * - twitch_drops_pubsub_connected (gauge 0/1)
 * - twitch_drops_up (gauge 1)
 * - twitch_drops_info (gauge 1) labels: version
 *
 * Usage:
 * - Registry holds current values (in-memory).
 * - Miner updates registry via exported methods.
 * - metrics endpoint serves registry.render()
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
class MetricsRegistry {
    // Simple counters/gauges
    watchTicksTotal = new Map(); // key = channel|game
    watchErrorsTotal = 0;
    channelSwitchesTotal = 0;
    inventoryFetchTotal = 0;
    claimedTotal = 0;
    pubsubConnected = 0;
    up = 1;
    // Current watching state
    watchingChannelId = "";
    watchingChannelLogin = "";
    watchingGame = "";
    // Game minutes totals — derived both from history module and miner's own per-session counter
    minutesPerGame = new Map();
    minutesPerChannel = new Map();
    campaignsTotal = 0;
    eligibleCampaigns = 0;
    version = "0.0.0";
    startedAt = Date.now();
    constructor() {
        try {
            const require = createRequire(import.meta.url);
            const pkg = require("../../package.json");
            if (pkg.version)
                this.version = pkg.version;
        }
        catch {
            // ignore
        }
    }
    setWatching(channelId, channelLogin, game) {
        if (this.watchingChannelId !== channelId ||
            this.watchingChannelLogin !== channelLogin ||
            this.watchingGame !== game) {
            if (this.watchingChannelId || channelId) {
                // count switch if we had previous or new valid
                if (this.watchingChannelId !== channelId) {
                    this.channelSwitchesTotal += 1;
                }
            }
        }
        this.watchingChannelId = channelId;
        this.watchingChannelLogin = channelLogin;
        this.watchingGame = game;
    }
    clearWatching() {
        this.watchingChannelId = "";
        this.watchingChannelLogin = "";
        this.watchingGame = "";
    }
    incWatchTick(channelId, channelLogin, game, minutes = 1) {
        const key = `${channelId}|${channelLogin}|${game}`;
        const existing = this.watchTicksTotal.get(key);
        if (existing) {
            existing.value += 1;
        }
        else {
            this.watchTicksTotal.set(key, {
                value: 1,
                labels: { channel_id: channelId, channel: channelLogin, game }
            });
        }
        // also accumulate per-game/per-channel
        this.minutesPerGame.set(game, (this.minutesPerGame.get(game) ?? 0) + minutes);
        this.minutesPerChannel.set(channelLogin, (this.minutesPerChannel.get(channelLogin) ?? 0) + minutes);
    }
    incWatchError() {
        this.watchErrorsTotal += 1;
    }
    incClaimed(n = 1) {
        this.claimedTotal += n;
    }
    incInventoryFetch() {
        this.inventoryFetchTotal += 1;
    }
    setCampaigns(total, eligible) {
        this.campaignsTotal = total;
        this.eligibleCampaigns = eligible;
    }
    setPubSubConnected(connected) {
        this.pubsubConnected = connected ? 1 : 0;
    }
    // Try to hydrate minutesPerGame from history db so metrics reflect long-term total, not just session
    hydrateFromHistory(summary) {
        for (const [game, mins] of Object.entries(summary.perGame)) {
            const cur = this.minutesPerGame.get(game) ?? 0;
            if (mins > cur)
                this.minutesPerGame.set(game, mins);
            else if (cur === 0)
                this.minutesPerGame.set(game, mins);
        }
        for (const [ch, mins] of Object.entries(summary.perChannel)) {
            const cur = this.minutesPerChannel.get(ch) ?? 0;
            if (mins > cur)
                this.minutesPerChannel.set(ch, mins);
            else if (cur === 0)
                this.minutesPerChannel.set(ch, mins);
        }
    }
    render() {
        const lines = [];
        const esc = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
        const addHeader = (name, help, type) => {
            lines.push(`# HELP ${name} ${help}`);
            lines.push(`# TYPE ${name} ${type}`);
        };
        // up
        addHeader("twitch_drops_up", "Miner process up (1 = up)", "gauge");
        lines.push(`twitch_drops_up 1`);
        addHeader("twitch_drops_info", "Miner info", "gauge");
        lines.push(`twitch_drops_info{version="${esc(this.version)}"} 1`);
        const uptimeSec = Math.floor((Date.now() - this.startedAt) / 1000);
        addHeader("twitch_drops_process_uptime_seconds", "Uptime seconds", "gauge");
        lines.push(`twitch_drops_process_uptime_seconds ${uptimeSec}`);
        addHeader("twitch_drops_watching", "Currently watching a channel (1) or not (0)", "gauge");
        if (this.watchingChannelId || this.watchingChannelLogin) {
            lines.push(`twitch_drops_watching{channel="${esc(this.watchingChannelLogin)}",channel_id="${esc(this.watchingChannelId)}",game="${esc(this.watchingGame)}"} 1`);
        }
        else {
            lines.push(`twitch_drops_watching{channel="",channel_id="",game=""} 0`);
        }
        addHeader("twitch_drops_minutes_total", "Total minutes watched per game", "gauge");
        for (const [game, mins] of this.minutesPerGame.entries()) {
            lines.push(`twitch_drops_minutes_total{game="${esc(game)}"} ${mins}`);
        }
        addHeader("twitch_drops_minutes_total_per_channel", "Total minutes watched per channel", "gauge");
        for (const [ch, mins] of this.minutesPerChannel.entries()) {
            lines.push(`twitch_drops_minutes_total_per_channel{channel="${esc(ch)}"} ${mins}`);
        }
        addHeader("twitch_drops_watch_ticks_total", "Watch tick successes (spade POST)", "counter");
        if (this.watchTicksTotal.size === 0) {
            lines.push(`twitch_drops_watch_ticks_total{channel="",channel_id="",game=""} 0`);
        }
        else {
            for (const entry of this.watchTicksTotal.values()) {
                lines.push(`twitch_drops_watch_ticks_total{channel="${esc(entry.labels.channel)}",channel_id="${esc(entry.labels.channel_id)}",game="${esc(entry.labels.game)}"} ${entry.value}`);
            }
        }
        addHeader("twitch_drops_watch_errors_total", "Watch tick errors", "counter");
        lines.push(`twitch_drops_watch_errors_total ${this.watchErrorsTotal}`);
        addHeader("twitch_drops_channel_switches_total", "Channel switches", "counter");
        lines.push(`twitch_drops_channel_switches_total ${this.channelSwitchesTotal}`);
        addHeader("twitch_drops_inventory_fetches_total", "Inventory fetch count", "counter");
        lines.push(`twitch_drops_inventory_fetches_total ${this.inventoryFetchTotal}`);
        addHeader("twitch_drops_campaigns_total", "Total campaigns seen", "gauge");
        lines.push(`twitch_drops_campaigns_total ${this.campaignsTotal}`);
        addHeader("twitch_drops_eligible_campaigns", "Eligible campaigns", "gauge");
        lines.push(`twitch_drops_eligible_campaigns ${this.eligibleCampaigns}`);
        addHeader("twitch_drops_claimed_total", "Drops claimed", "counter");
        lines.push(`twitch_drops_claimed_total ${this.claimedTotal}`);
        addHeader("twitch_drops_pubsub_connected", "PubSub connected (1) or not (0)", "gauge");
        lines.push(`twitch_drops_pubsub_connected ${this.pubsubConnected}`);
        lines.push(""); // trailing newline required by exposition format
        return lines.join("\n");
    }
    toJSON() {
        return {
            watchingChannelId: this.watchingChannelId,
            watchingChannelLogin: this.watchingChannelLogin,
            watchingGame: this.watchingGame,
            minutesPerGame: Object.fromEntries(this.minutesPerGame),
            minutesPerChannel: Object.fromEntries(this.minutesPerChannel),
            watchTicksTotal: Array.from(this.watchTicksTotal.values()),
            watchErrorsTotal: this.watchErrorsTotal,
            channelSwitchesTotal: this.channelSwitchesTotal,
            inventoryFetchTotal: this.inventoryFetchTotal,
            claimedTotal: this.claimedTotal,
            campaignsTotal: this.campaignsTotal,
            eligibleCampaigns: this.eligibleCampaigns,
            pubsubConnected: this.pubsubConnected,
            uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
            version: this.version
        };
    }
}
// singleton that's safe for import
export const metricsRegistry = new MetricsRegistry();
// Try to pre-hydrate from history on import (best-effort, no throw)
try {
    // lazy import to avoid circular: history -> runtime dir; metrics shouldn't import history eagerly with sqlite open?
    // We'll do it via dynamic require-like handling.
    const stateDir = path.join(os.homedir(), ".local", "state", "tdm");
    const dbPath = path.join(stateDir, "history.db");
    const jsonlPath = path.join(stateDir, "history.jsonl");
    // If db exists, attempt hydration via sqlite read if node:sqlite available
    if (fs.existsSync(dbPath)) {
        try {
            const require = createRequire(import.meta.url);
            const mod = require("node:sqlite");
            const db = new mod.DatabaseSync(dbPath, { readonly: true });
            const rowsGame = db.prepare("SELECT game, SUM(minutes_total) as total FROM ticks GROUP BY game").all();
            const rowsCh = db
                .prepare("SELECT channel_login as login, SUM(minutes_total) as total FROM ticks GROUP BY channel_login")
                .all();
            const perGame = {};
            for (const r of rowsGame)
                perGame[r.game] = r.total;
            const perChannel = {};
            for (const r of rowsCh)
                perChannel[r.login] = r.total;
            metricsRegistry.hydrateFromHistory({ perGame, perChannel });
            try {
                db.close();
            }
            catch { }
        }
        catch {
            // fallthrough to jsonl
        }
    }
    if (metricsRegistry.minutesPerGame.size === 0 && fs.existsSync(jsonlPath)) {
        try {
            const raw = fs.readFileSync(jsonlPath, "utf8").trim();
            if (raw) {
                const perGame = {};
                const perChannel = {};
                for (const line of raw.split("\n")) {
                    try {
                        const obj = JSON.parse(line);
                        perGame[obj.game] = (perGame[obj.game] ?? 0) + (obj.minutesTotal ?? 1);
                        perChannel[obj.channelLogin] = (perChannel[obj.channelLogin] ?? 0) + (obj.minutesTotal ?? 1);
                    }
                    catch {
                        continue;
                    }
                }
                metricsRegistry.hydrateFromHistory({ perGame, perChannel });
            }
        }
        catch {
            // ignore
        }
    }
}
catch {
    // ignore hydration errors
}
// ---------------------------------------------------------------------------
// HTTP endpoint logic
// ---------------------------------------------------------------------------
let metricsServer = null;
// Callbacks for richer endpoints (set by miner)
let getActiveDropsCallback = null;
let getStatusCallback = null;
export function setActiveDropsProvider(cb) {
    getActiveDropsCallback = cb;
}
export function setStatusProvider(cb) {
    getStatusCallback = cb;
}
export function startMetricsServer(opts) {
    if (metricsServer) {
        return metricsServer;
    }
    const listenPath = opts.path ?? "/metrics";
    const host = opts.host ?? "127.0.0.1";
    const srv = http.createServer((req, res) => {
        try {
            const url = req.url ?? "";
            if (url === listenPath || url === `${listenPath}` || url.startsWith(`${listenPath}?`)) {
                const body = metricsRegistry.render();
                res.writeHead(200, {
                    "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
                    "Content-Length": Buffer.byteLength(body)
                });
                res.end(body);
                return;
            }
            if (url === "/drops") {
                // Active drop details for dashboards
                try {
                    const drops = getActiveDropsCallback ? getActiveDropsCallback() : [];
                    const j = JSON.stringify(drops);
                    res.writeHead(200, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(j) });
                    res.end(j);
                }
                catch {
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end("[]");
                }
                return;
            }
            if (url === "/status") {
                try {
                    const s = getStatusCallback ? getStatusCallback() : {};
                    const j = JSON.stringify({ ...metricsRegistry.toJSON(), ...s });
                    res.writeHead(200, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(j) });
                    res.end(j);
                }
                catch {
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end("{}");
                }
                return;
            }
            if (url === "/health" || url === "/") {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify(metricsRegistry.toJSON()));
                return;
            }
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("Not found. Try /metrics, /drops, /status, /health\n");
        }
        catch {
            try {
                res.writeHead(500);
                res.end("internal error");
            }
            catch { }
        }
    });
    srv.listen(opts.port, host);
    metricsServer = srv;
    return srv;
}
export function stopMetricsServer() {
    if (!metricsServer)
        return Promise.resolve();
    const srv = metricsServer;
    metricsServer = null;
    return new Promise((resolve) => {
        try {
            srv.close(() => resolve());
        }
        catch {
            resolve();
        }
    });
}
export function getMetricsText() {
    return metricsRegistry.render();
}
export function getMetricsJSON() {
    return metricsRegistry.toJSON();
}
