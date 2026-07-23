import { Command } from "@commander-js/extra-typings";
import { getHistoryBackend, getHistoryPaths, pruneHistory, readRecentTicks, summarizeHistory } from "../../ops/history.js";

export const historyCommand = new Command("history")
  .description("Watch history — show local minute ticks and summaries")
  .option("--json", "Output JSON", false)
  .option("--limit <n>", "Recent ticks to show (default 50)", "50")
  .option("--summary", "Show summary per game/channel", false)
  .option("--paths", "Show history file paths and backend", false)
  .option("--prune-days <days>", "Prune history older than N days (default 30)")
  .action(async (opts) => {
    const paths = getHistoryPaths();
    const backend = getHistoryBackend();

    // pruning takes precedence
    const pruneOpt = (opts as any)["pruneDays"] as string | undefined;
    if (pruneOpt !== undefined) {
      const days = Number(pruneOpt);
      const effective = Number.isFinite(days) && days > 0 ? days : 30;
      const removed = pruneHistory(effective);
      if (opts.json) {
        // eslint-disable-next-line no-console
        console.log(
          JSON.stringify(
            { pruned: removed, days: effective, backend, stateDir: paths.stateDir, dbPath: paths.dbPath, jsonlPath: paths.jsonlPath },
            null,
            2
          )
        );
      } else {
        // eslint-disable-next-line no-console
        console.log(`Pruned ${removed} entries older than ${effective}d (backend=${backend})`);
        // eslint-disable-next-line no-console
        console.log(`DB: ${paths.dbPath}  JSONL: ${paths.jsonlPath}`);
      }
      return;
    }

    if ((opts as any).paths) {
      if (opts.json) {
        // eslint-disable-next-line no-console
        console.log(JSON.stringify({ backend, stateDir: paths.stateDir, dbPath: paths.dbPath, jsonlPath: paths.jsonlPath }, null, 2));
      } else {
        // eslint-disable-next-line no-console
        console.log(`Backend: ${backend}`);
        // eslint-disable-next-line no-console
        console.log(`State dir: ${paths.stateDir}`);
        // eslint-disable-next-line no-console
        console.log(`SQLite: ${paths.dbPath}`);
        // eslint-disable-next-line no-console
        console.log(`JSONL fallback: ${paths.jsonlPath}`);
      }
      return;
    }

    if ((opts as any).summary) {
      const summary = summarizeHistory();
      if (opts.json) {
        // eslint-disable-next-line no-console
        console.log(JSON.stringify({ backend, stateDir: paths.stateDir, dbPath: paths.dbPath, jsonlPath: paths.jsonlPath, summary }, null, 2));
      } else {
        // eslint-disable-next-line no-console
        console.log(`Backend: ${backend}  totalTicks=${summary.totalTicks} from=${summary.fromTs ?? "-"} to=${summary.toTs ?? "-"}`);
        // eslint-disable-next-line no-console
        console.log("Per game:");
        for (const [game, mins] of Object.entries(summary.perGame)) {
          // eslint-disable-next-line no-console
          console.log(`  ${game}: ${mins}m`);
        }
        // eslint-disable-next-line no-console
        console.log("Per channel:");
        for (const [ch, mins] of Object.entries(summary.perChannel)) {
          // eslint-disable-next-line no-console
          console.log(`  ${ch}: ${mins}m`);
        }
      }
      return;
    }

    const limit = Math.max(1, Math.min(1000, Number((opts as any).limit) || 50));
    const ticks = readRecentTicks(limit);
    if (opts.json) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ backend, count: ticks.length, ticks }, null, 2));
    } else {
      if (ticks.length === 0) {
        // eslint-disable-next-line no-console
        console.log(`No history yet (backend=${backend}). Watch minutes will appear after tdm run records ticks.`);
        // eslint-disable-next-line no-console
        console.log(`Paths: ${paths.dbPath} / ${paths.jsonlPath}`);
      } else {
        // eslint-disable-next-line no-console
        console.log(`Recent ${ticks.length} ticks (backend=${backend}):`);
        for (const t of ticks) {
          // eslint-disable-next-line no-console
          console.log(`${t.ts}  ${t.channelLogin} (${t.channelId})  game=${t.game}  mins=${t.minutesTotal}`);
        }
      }
    }
  });
