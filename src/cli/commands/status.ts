import { Command } from "@commander-js/extra-typings";
import { loadSessionState } from "../../state/sessionState.js";

export const statusCommand = new Command("status")
  .description("Show current miner status")
  .option("--json", "Output status as JSON")
  .action(async (opts) => {
    const session = loadSessionState();
    const status = {
      running: session?.state !== "EXIT",
      state: session?.state ?? "UNKNOWN",
      watchedChannel: session?.watchedChannelName ?? null,
      activeDrop: session?.activeDropId ?? null
    };

    if (opts.json) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(status));
    } else {
      // eslint-disable-next-line no-console
      console.log(
        `State=${status.state}, channel=${status.watchedChannel ?? "-"}, activeDrop=${status.activeDrop ?? "-"}`
      );
    }
  });

