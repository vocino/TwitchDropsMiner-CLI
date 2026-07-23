import { Command } from "@commander-js/extra-typings";
import { loadSessionState } from "../../state/sessionState.js";
import { summarizeHistory } from "../../ops/history.js";
import { getMetricsJSON } from "../../ops/metrics.js";
export const watchCommand = new Command("watch")
    .description("Live TUI — watch miner status (refreshes every N seconds)")
    .option("--interval <sec>", "Refresh seconds", "2")
    .action(async (opts) => {
    const interval = Math.max(1, Number(opts.interval) || 2);
    const render = () => {
        const session = loadSessionState();
        let summary = null;
        let metrics;
        try {
            summary = summarizeHistory();
        }
        catch { }
        try {
            metrics = getMetricsJSON();
        }
        catch {
            metrics = {};
        }
        console.clear();
        const now = new Date().toISOString();
        console.log(`tdm watch — ${now} — refresh ${interval}s — Ctrl+C to exit`);
        console.log(`state: ${session?.state ?? "unknown"}  watched: ${session?.watchedChannelName ?? "-"} (${session?.watchedChannelId ?? "-"})`);
        if (session?.updatedAt) {
            const age = ((Date.now() - new Date(session.updatedAt).getTime()) / 1000) | 0;
            console.log(`session age: ${age}s ago  updatedAt: ${session.updatedAt}`);
        }
        if (metrics?.watchingChannelLogin) {
            console.log(`watching metric: ${metrics.watchingChannelLogin} (${metrics.watchingChannelId}) ${metrics.watchingGame}  ticks=${metrics.watchTicksTotal?.length ?? 0}`);
        }
        if (summary) {
            console.log(`\nHistory: ${summary.totalTicks} ticks from ${summary.fromTs ?? "-"} to ${summary.toTs ?? "-"}`);
            console.log("Per game:");
            const sorted = Object.entries(summary.perGame).sort((a, b) => b[1] - a[1]).slice(0, 8);
            for (const [game, mins] of sorted) {
                const max = sorted[0]?.[1] ?? 1;
                const bar = "#".repeat(Math.min(20, Math.round((mins / max) * 20)));
                console.log(`  ${game.slice(0, 28).padEnd(30)} ${String(mins).padStart(5)}m [${bar}]`);
            }
        }
    };
    render();
    const timer = setInterval(render, interval * 1000);
    await new Promise((resolve) => {
        process.on("SIGINT", () => {
            clearInterval(timer);
            resolve();
        });
    });
});
