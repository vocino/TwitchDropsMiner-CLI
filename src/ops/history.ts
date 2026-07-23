/**
 * Watch history recorder — XDG state dir: ~/.local/state/tdm/
 *
 * Goals:
 * - Zero native deps (engines >=20, but Node 22.5+ has node:sqlite builtin).
 * - Prefer node:sqlite if available, else fallback to JSONL (history.jsonl).
 * - Record minute ticks: timestamp, channelId, channelLogin, game, minutesTotal per game.
 * - Safe/no-throw public API; miner loop must never crash on history errors.
 *
 * Design:
 * - stateDir = ~/.local/state/tdm (same as lock + session)
 * - files:
 *   - history.db   (when sqlite path works)
 *   - history.jsonl (fallback + always-produced mirror if desired? For now one-or-other)
 *   - future: history.db-wal etc auto-handled by SQLite
 *
 * SQLite schema (v1):
 *   CREATE TABLE IF NOT EXISTS ticks(
 *     id INTEGER PRIMARY KEY AUTOINCREMENT,
 *     ts TEXT NOT NULL,               -- ISO8601 UTC
 *     channel_id TEXT NOT NULL,
 *     channel_login TEXT NOT NULL,
 *     game TEXT NOT NULL,
 *     minutes_total INTEGER NOT NULL DEFAULT 1
 *   );
 *   CREATE INDEX IF NOT EXISTS idx_ticks_ts ON ticks(ts);
 *   CREATE INDEX IF NOT EXISTS idx_ticks_game ON ticks(game);
 *   CREATE INDEX IF NOT EXISTS idx_ticks_channel ON ticks(channel_login);
 *
 * JSONL schema (one JSON per line):
 *   { ts, channelId, channelLogin, game, minutesTotal }
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

export interface HistoryTick {
  ts: string; // ISO string
  channelId: string;
  channelLogin: string;
  game: string;
  minutesTotal: number; // total minutes watched for game at this tick (or 1 for delta if we store per-minute). For simplicity we store per-tick = 1 and aggregate
}

// Internal shape stored; minutesTotal in file = cumulative? Spec says "minutesTotal per game"
// We'll interpret as: per tick we store delta=1 plus we compute cumulative via query.
// To satisfy "minutesTotal per game" we store the minute count contributed at this tick (1)
// and expose aggregation helpers. The recordTick API accepts explicit total if known.
export interface HistoryRecordInput {
  channelId: string;
  channelLogin: string;
  game: string;
  minutesTotal?: number; // if caller knows total watched for that game, else defaults 1
  ts?: string; // for testing / override
}

export interface HistorySummary {
  totalTicks: number;
  perGame: Record<string, number>;
  perChannel: Record<string, number>;
  fromTs: string | null;
  toTs: string | null;
}

function stateDir(): string {
  const dir = path.join(os.homedir(), ".local", "state", "tdm");
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch {
    // ignore — caller will handle file errors
  }
  return dir;
}

function historyDbPath(): string {
  return path.join(stateDir(), "history.db");
}

function historyJsonlPath(): string {
  return path.join(stateDir(), "history.jsonl");
}

// ---------------------------------------------------------------------------
// Backend detection: can we load node:sqlite ?
// Use both require and dynamic import style detection.
// Node 22.5+ built-in, but we're on 25.7 so available here, but we must keep 20.x compat source.
// ---------------------------------------------------------------------------

type SqliteDbHandle =
  | {
      kind: "sqlite";
      db: any; // DatabaseSync instance
    }
  | {
      kind: "none";
    };

let detectedBackend: "sqlite" | "jsonl" | null = null;
let sqliteInitAttempted = false;
let sqliteDb: SqliteDbHandle = { kind: "none" };

function tryOpenSqlite(): boolean {
  if (sqliteInitAttempted) {
    return sqliteDb.kind === "sqlite";
  }
  sqliteInitAttempted = true;

  // Try dynamic require via createRequire to avoid bundler static analysis
  try {
    const require = createRequire(import.meta.url);
    // node:sqlite is builtin, require works on Node 22.5+
    const mod = require("node:sqlite") as {
      DatabaseSync: new (path: string, opts?: Record<string, unknown>) => any;
    };
    if (mod && mod.DatabaseSync) {
      const dbPath = historyDbPath();
      const db = new mod.DatabaseSync(dbPath, {});
      // WAL mode usually better, but keep default for minimalism; try enable WAL
      try {
        db.exec("PRAGMA journal_mode = WAL;");
      } catch {
        // ignore
      }
      db.exec(`
        CREATE TABLE IF NOT EXISTS ticks(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ts TEXT NOT NULL,
          channel_id TEXT NOT NULL,
          channel_login TEXT NOT NULL,
          game TEXT NOT NULL,
          minutes_total INTEGER NOT NULL DEFAULT 1
        );
        CREATE INDEX IF NOT EXISTS idx_ticks_ts ON ticks(ts);
        CREATE INDEX IF NOT EXISTS idx_ticks_game ON ticks(game);
        CREATE INDEX IF NOT EXISTS idx_ticks_channel ON ticks(channel_login);
      `);
      sqliteDb = { kind: "sqlite", db };
      detectedBackend = "sqlite";
      return true;
    }
  } catch {
    // swallow — fallback to jsonl
  }

  detectedBackend = "jsonl";
  return false;
}

function ensureBackend(): "sqlite" | "jsonl" {
  if (detectedBackend) return detectedBackend;
  const ok = tryOpenSqlite();
  return ok ? "sqlite" : "jsonl";
}

export function getHistoryBackend(): "sqlite" | "jsonl" {
  return ensureBackend();
}

export function getHistoryPaths(): { dbPath: string; jsonlPath: string; backend: "sqlite" | "jsonl"; stateDir: string } {
  const backend = ensureBackend();
  return {
    dbPath: historyDbPath(),
    jsonlPath: historyJsonlPath(),
    backend,
    stateDir: stateDir()
  };
}

// ---------------------------------------------------------------------------
// Write path
// ---------------------------------------------------------------------------

/** Record a one-minute watch tick. Safe to call frequently, never throws. */
export function recordTick(input: HistoryRecordInput): void {
  try {
    const backend = ensureBackend();
    const ts = input.ts ?? new Date().toISOString();
    // sanitize
    const channelId = String(input.channelId ?? "").trim() || "unknown";
    const channelLogin = String(input.channelLogin ?? "").trim() || "unknown";
    const game = String(input.game ?? "").trim() || "unknown";
    const minutesTotal = Number.isFinite(input.minutesTotal) ? Math.max(1, Math.floor(input.minutesTotal as number)) : 1;

    if (backend === "sqlite" && sqliteDb.kind === "sqlite") {
      try {
        const stmt = sqliteDb.db.prepare(
          "INSERT INTO ticks(ts, channel_id, channel_login, game, minutes_total) VALUES (?, ?, ?, ?, ?)"
        );
        stmt.run(ts, channelId, channelLogin, game, minutesTotal);
        return;
      } catch (err) {
        // If sqlite write fails, fall through to jsonl so we don't lose data
        // but also attempt to log quietly
        tryAppendJsonl({ ts, channelId, channelLogin, game, minutesTotal });
        return;
      }
    }

    // jsonl fallback
    tryAppendJsonl({ ts, channelId, channelLogin, game, minutesTotal });
  } catch {
    // never crash miner
  }
}

function tryAppendJsonl(row: { ts: string; channelId: string; channelLogin: string; game: string; minutesTotal: number }): void {
  try {
    const p = historyJsonlPath();
    // ensure dir exists (stateDir() already mkdir)
    const line = JSON.stringify({
      ts: row.ts,
      channelId: row.channelId,
      channelLogin: row.channelLogin,
      game: row.game,
      minutesTotal: row.minutesTotal
    });
    fs.appendFileSync(p, line + "\n", { mode: 0o600 });
    // try chmod if file existed before
    try {
      fs.chmodSync(p, 0o600);
    } catch {
      // ignore
    }
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Read path
// ---------------------------------------------------------------------------

export function readRecentTicks(limit = 100): HistoryTick[] {
  try {
    const backend = ensureBackend();
    if (backend === "sqlite" && sqliteDb.kind === "sqlite") {
      const stmt = sqliteDb.db.prepare(
        "SELECT ts, channel_id as channelId, channel_login as channelLogin, game, minutes_total as minutesTotal FROM ticks ORDER BY id DESC LIMIT ?"
      );
      const rows = stmt.all(limit) as HistoryTick[];
      return rows.reverse();
    }
    // jsonl
    const p = historyJsonlPath();
    if (!fs.existsSync(p)) return [];
    const content = fs.readFileSync(p, "utf8").trim();
    if (!content) return [];
    const lines = content.split("\n").slice(-limit);
    const out: HistoryTick[] = [];
    for (const line of lines) {
      try {
        const obj = JSON.parse(line) as HistoryTick;
        if (obj.ts && obj.channelId) out.push(obj);
      } catch {
        continue;
      }
    }
    return out;
  } catch {
    return [];
  }
}

export function summarizeHistory(): HistorySummary {
  try {
    const backend = ensureBackend();
    if (backend === "sqlite" && sqliteDb.kind === "sqlite") {
      const countRow = sqliteDb.db.prepare("SELECT COUNT(*) as c FROM ticks").get() as { c: number };
      const totalTicks = countRow?.c ?? 0;
      if (totalTicks === 0) {
        return { totalTicks: 0, perGame: {}, perChannel: {}, fromTs: null, toTs: null };
      }
      const perGameRows = sqliteDb.db
        .prepare("SELECT game, SUM(minutes_total) as total FROM ticks GROUP BY game ORDER BY total DESC")
        .all() as Array<{ game: string; total: number }>;
      const perChannelRows = sqliteDb.db
        .prepare("SELECT channel_login as login, SUM(minutes_total) as total FROM ticks GROUP BY channel_login ORDER BY total DESC")
        .all() as Array<{ login: string; total: number }>;
      const bounds = sqliteDb.db.prepare("SELECT MIN(ts) as minTs, MAX(ts) as maxTs FROM ticks").get() as {
        minTs: string;
        maxTs: string;
      };

      const perGame: Record<string, number> = {};
      for (const r of perGameRows) perGame[r.game] = r.total;
      const perChannel: Record<string, number> = {};
      for (const r of perChannelRows) perChannel[r.login] = r.total;

      return {
        totalTicks,
        perGame,
        perChannel,
        fromTs: bounds.minTs,
        toTs: bounds.maxTs
      };
    }

    // jsonl summarization
    const p = historyJsonlPath();
    if (!fs.existsSync(p)) {
      return { totalTicks: 0, perGame: {}, perChannel: {}, fromTs: null, toTs: null };
    }
    const raw = fs.readFileSync(p, "utf8").trim();
    if (!raw) return { totalTicks: 0, perGame: {}, perChannel: {}, fromTs: null, toTs: null };
    const lines = raw.split("\n");
    let totalTicks = 0;
    const perGame: Record<string, number> = {};
    const perChannel: Record<string, number> = {};
    let fromTs: string | null = null;
    let toTs: string | null = null;

    for (const line of lines) {
      try {
        const obj = JSON.parse(line) as HistoryTick;
        totalTicks += 1;
        perGame[obj.game] = (perGame[obj.game] ?? 0) + (obj.minutesTotal ?? 1);
        perChannel[obj.channelLogin] = (perChannel[obj.channelLogin] ?? 0) + (obj.minutesTotal ?? 1);
        if (!fromTs || obj.ts < fromTs) fromTs = obj.ts;
        if (!toTs || obj.ts > toTs) toTs = obj.ts;
      } catch {
        continue;
      }
    }
    return { totalTicks, perGame, perChannel, fromTs, toTs };
  } catch {
    return { totalTicks: 0, perGame: {}, perChannel: {}, fromTs: null, toTs: null };
  }
}

/** For maintenance: prune entries older than N days (sqlite only; jsonl rewrites file). */
export function pruneHistory(days = 30): number {
  try {
    const backend = ensureBackend();
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    if (backend === "sqlite" && sqliteDb.kind === "sqlite") {
      const stmt = sqliteDb.db.prepare("DELETE FROM ticks WHERE ts < ?");
      const result = stmt.run(cutoff) as { changes: number };
      return result.changes ?? 0;
    }
    const p = historyJsonlPath();
    if (!fs.existsSync(p)) return 0;
    const lines = fs.readFileSync(p, "utf8").split("\n").filter(Boolean);
    const kept: string[] = [];
    let removed = 0;
    for (const line of lines) {
      try {
        const obj = JSON.parse(line) as HistoryTick;
        if (obj.ts >= cutoff) kept.push(line);
        else removed += 1;
      } catch {
        // keep malformed? drop to clean
        removed += 1;
      }
    }
    if (removed > 0) {
      fs.writeFileSync(p, kept.join("\n") + (kept.length ? "\n" : ""), { mode: 0o600 });
    }
    return removed;
  } catch {
    return 0;
  }
}

/** Reset detection - useful for tests to force re-init */
export function _resetHistoryForTests(): void {
  try {
    if (sqliteDb.kind === "sqlite") {
      try {
        sqliteDb.db.close();
      } catch {}
    }
  } catch {}
  sqliteDb = { kind: "none" };
  detectedBackend = null;
  sqliteInitAttempted = false;
}
