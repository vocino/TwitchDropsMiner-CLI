import { Command } from "@commander-js/extra-typings";
import { getMetricsJSON, getMetricsText, startMetricsServer } from "../../ops/metrics.js";
import { getHistoryPaths } from "../../ops/history.js";
export const metricsCommand = new Command("metrics")
    .description("Prometheus metrics — print or serve twitch_drops_*")
    .option("--json", "Output metrics registry as JSON (instead of Prometheus exposition)", false)
    .option("--serve", "Start a tiny HTTP server exposing /metrics", false)
    .option("--port <port>", "Port for --serve (default 9098)", "9098")
    .option("--host <host>", "Host for --serve (default 127.0.0.1)", "127.0.0.1")
    .option("--path <path>", "Prom metrics path (default /metrics)", "/metrics")
    .action(async (opts) => {
    if (opts.serve) {
        const port = Number(opts.port) || 9098;
        const host = String(opts.host ?? "127.0.0.1");
        const p = String(opts.path ?? "/metrics");
        const srv = startMetricsServer({ host, port, path: p });
        const paths = getHistoryPaths();
        // eslint-disable-next-line no-console
        console.log(`Metrics server listening on http://${host}:${port}${p} (also / for JSON) — state dir ${paths.stateDir}`);
        // Keep process alive
        await new Promise(() => {
            // never resolves, server lives until SIGINT
        });
        return;
    }
    if (opts.json) {
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(getMetricsJSON(), null, 2));
    }
    else {
        // eslint-disable-next-line no-console
        console.log(getMetricsText());
    }
});
