import { Command } from "@commander-js/extra-typings";
import { Miner } from "../../core/miner.js";
import { logger } from "../../core/runtime.js";
import { startMetricsServer } from "../../ops/metrics.js";
export const runCommand = new Command("run")
    .description("Run the Twitch drops miner")
    .option("-v, --verbose", "Enable verbose logging")
    .option("--dry-run", "Log intended actions only; no spade POST or claim GQL")
    .option("--no-lock", "Skip single-instance lock (use if a previous run left a stale lock)")
    .option("--metrics-port <port>", "Expose Prometheus /metrics on given port (default disabled)")
    .option("--metrics-host <host>", "Metrics bind host (default 127.0.0.1)", "127.0.0.1")
    .action(async (opts) => {
    if (opts.verbose) {
        process.env.TDM_LOG_LEVEL = "debug";
    }
    if (opts.metricsPort) {
        const port = Number(opts.metricsPort);
        if (Number.isFinite(port)) {
            const host = String(opts.metricsHost ?? "127.0.0.1");
            try {
                startMetricsServer({ host, port });
                logger.info(`Metrics endpoint enabled at http://${host}:${port}/metrics`);
            }
            catch (err) {
                logger.warn({ err }, `Failed to start metrics server on ${host}:${port}`);
            }
        }
    }
    const miner = new Miner();
    if (opts.verbose) {
        logger.info("Starting TwitchDropsMiner CLI in verbose mode.");
    }
    if (opts.dryRun) {
        logger.info("Dry-run mode: no spade or claim network writes.");
    }
    await miner.run({ dryRun: opts.dryRun ?? false });
});
