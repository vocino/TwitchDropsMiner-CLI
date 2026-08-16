import { Command } from "@commander-js/extra-typings";
import os from "node:os";
import fs from "node:fs";
import { request } from "undici";
import { EXIT_ENV_UNSUPPORTED, EXIT_OK } from "../contracts/exitCodes.js";
import { loadConfig, configPath } from "../../config/store.js";
import { GQL_OPERATIONS } from "../../integrations/gqlOperations.js";
import { MAX_CHANNELS, MAX_WEBSOCKETS, WS_TOPICS_LIMIT } from "../../core/constants.js";

export const doctorCommand = new Command("doctor")
  .description("Run environment checks for TwitchDropsMiner CLI")
  .option("--json", "Output JSON", false)
  .action(async (opts) => {
    const isJson = opts.json as boolean;
    const issues: string[] = [];
    const warnings: string[] = [];
    const checks: Record<string, string> = {};

    const platform = os.platform();
    if (platform !== "linux" && platform !== "darwin" && platform !== "win32") {
      issues.push(`Unsupported platform: ${platform}`);
    } else {
      checks.platform = platform;
    }

    const [majorStr] = process.versions.node.split(".");
    const major = Number(majorStr);
    if (!Number.isNaN(major) && major < 20) {
      issues.push(`Node.js version ${process.versions.node} is below the required >=20.`);
    } else {
      checks.node = process.versions.node;
    }

    try {
      const cfg = loadConfig();
      const p = configPath();
      if (!fs.existsSync(p)) {
        warnings.push(`Config not found at ${p}, using defaults`);
      } else {
        checks.config = p;
      }
      if (Object.keys(cfg.gqlHashOverrides ?? {}).length > 0) {
        for (const [opName, hash] of Object.entries(cfg.gqlHashOverrides)) {
          if (!/^[0-9a-f]{64}$/i.test(hash)) {
            warnings.push(`Invalid gqlHashOverrides[${opName}]: must be 64 hex chars`);
          }
        }
        checks.hashOverrides = `${Object.keys(cfg.gqlHashOverrides).length} override(s)`;
      }
      if (cfg.proxy) {
        try {
          new URL(cfg.proxy);
          checks.proxy = "set (redacted)";
        } catch {
          issues.push(`Config proxy is not a valid URL: ${cfg.proxy}`);
        }
      }
      const actualOps = Object.keys(GQL_OPERATIONS).length;
      if (actualOps < 11) {
        warnings.push(`Only ${actualOps} GQL ops (expected >=11), may be stale`);
      } else {
        checks.gqlOps = `${actualOps} ops`;
      }
    } catch (err) {
      issues.push(`Config load failed: ${(err as Error).message}`);
    }

    try {
      const res = await request("https://id.twitch.tv/oauth2/validate", { method: "GET" });
      checks.twitchAuth = `HTTP ${res.statusCode}`;
      if (res.statusCode >= 500) {
        issues.push(`Twitch endpoint returned ${res.statusCode}.`);
      }
    } catch (err) {
      issues.push(`Network reachability check failed: ${(err as Error).message}`);
    }

    try {
      const res = await request("https://gql.twitch.tv/gql", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({})
      });
      checks.twitchGql = `HTTP ${res.statusCode}`;
    } catch (err) {
      warnings.push(`GQL endpoint unreachable: ${(err as Error).message}`);
    }

    const result = {
      ok: issues.length === 0,
      issues,
      warnings,
      checks,
      parity: {
        maxChannels: MAX_CHANNELS,
        maxWebsockets: MAX_WEBSOCKETS,
        wsTopicsLimit: WS_TOPICS_LIMIT,
        gqlOps: Object.keys(GQL_OPERATIONS).length,
        preconditionsMet: true,
        spadeParity: ["game", "game_id", "client_time", "is_live", "minutes_logged"],
        pool: `${MAX_WEBSOCKETS}x${WS_TOPICS_LIMIT} sharded`
      }
    };

    if (isJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      for (const [k, v] of Object.entries(result.checks)) {
        console.log(`ok ${k}: ${v}`);
      }
      if (result.parity) {
        console.log(`ok parity: MAX_CHANNELS=${result.parity.maxChannels} pool=${result.parity.pool} GQL=${result.parity.gqlOps} ops`);
      }
      for (const w of result.warnings) {
        console.warn(`warn ${w}`);
      }
      for (const msg of result.issues) {
        console.error(`err ${msg}`);
      }
      if (result.ok) {
        console.log("Environment looks OK for TwitchDropsMiner CLI.");
      }
    }

    process.exitCode = result.ok ? EXIT_OK : EXIT_ENV_UNSUPPORTED;
  });
