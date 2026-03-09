import { Command } from "@commander-js/extra-typings";
import { Miner } from "../../core/miner.js";
import { logger } from "../../core/runtime.js";

export const runCommand = new Command("run")
  .description("Run the Twitch drops miner")
  .option("-v, --verbose", "Enable verbose logging")
  .action(async (opts) => {
    if (opts.verbose) {
      process.env.TDM_LOG_LEVEL = "debug";
    }
    const miner = new Miner();
    if (opts.verbose) {
      logger.info("Starting TwitchDropsMiner CLI in verbose mode.");
    }
    await miner.run();
  });

