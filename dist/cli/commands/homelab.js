import { Command } from "@commander-js/extra-typings";
import { loadHooks } from "../../ops/webhooks.js";
import { summarizeHistory, readRecentTicks } from "../../ops/history.js";
import { getMetricsText, getMetricsJSON } from "../../ops/metrics.js";
export const hooksCommand = new Command("hooks")
    .description("Manage webhook hooks for homelab glue (onClaim/onProgress/onChannelSwitch/onError)")
    .option("--json", "JSON", false)
    .action(async (opts) => {
    const hooks = loadHooks();
    if (opts.json) {
        console.log(JSON.stringify(hooks, null, 2));
        return;
    }
    console.log("Current hooks (use tdm config set webhooks.onClaim <url> etc):");
    console.log(`  onClaim: ${hooks.onClaim || "(none)"}`);
    console.log(`  onProgress: ${hooks.onProgress || "(none)"}`);
    console.log(`  onChannelSwitch: ${hooks.onChannelSwitch || "(none)"}`);
    console.log(`  onError: ${hooks.onError || "(none)"}`);
    console.log("\nExamples:");
    console.log("  tdm config set webhooks.onClaim https://ntfy.sh/mytopic");
    console.log("  tdm config set webhooks.onClaim exec:/home/user/notify.sh '{{dropName}} claimed'");
    console.log("Templates: {{game}} {{dropName}} {{channelLogin}} {{type}} {{ts}}");
});
export const exportCommand = new Command("export")
    .description("Export inventory/history/metrics in various formats")
    .option("--format <fmt>", "json|csv|prometheus (default json)", "json")
    .option("--what <what>", "history|metrics|drops|all (default history)", "history")
    .option("--limit <n>", "Limit for history", "1000")
    .action(async (opts) => {
    const fmt = String(opts.format || "json").toLowerCase();
    const what = String(opts.what || "history").toLowerCase();
    const limit = Math.max(1, Number(opts.limit) || 1000);
    const emitJSON = (obj) => console.log(JSON.stringify(obj, null, 2));
    if (what === "metrics" || what === "all") {
        if (fmt === "prometheus") {
            console.log(getMetricsText());
        }
        else {
            emitJSON(getMetricsJSON());
        }
        if (what !== "all")
            return;
    }
    if (what === "history" || what === "all") {
        const ticks = readRecentTicks(limit);
        const summary = summarizeHistory();
        if (fmt === "csv") {
            console.log("ts,channel_id,channel_login,game,minutes_total");
            for (const t of ticks) {
                console.log(`${t.ts},${t.channelId},${t.channelLogin},${JSON.stringify(t.game)},${t.minutesTotal}`);
            }
        }
        else {
            emitJSON({ summary, ticks });
        }
        if (what !== "all")
            return;
    }
    if (what === "drops") {
        const summary = summarizeHistory();
        emitJSON(summary);
    }
});
