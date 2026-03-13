import { Command } from "@commander-js/extra-typings";
import { Miner } from "../../core/miner.js";
import { logger } from "../../core/runtime.js";
export const runCommand = new Command("run")
    .description("Run the Twitch drops miner")
    .option("-v, --verbose", "Enable verbose logging")
    .option("--dry-run", "Log intended actions only; no spade POST or claim GQL")
    .option("--no-lock", "Skip single-instance lock (use if a previous run left a stale lock)")
    .action(async (opts) => {
    if (opts.verbose) {
        process.env.TDM_LOG_LEVEL = "debug";
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
