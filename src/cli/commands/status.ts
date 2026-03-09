import { Command } from "@commander-js/extra-typings";
import { loadSessionState } from "../../state/sessionState.js";

export const statusCommand = new Command("status")
  .description("Show current miner status")
  .option("--json", "Output status as JSON")
  .action(async (opts) => {
    const session = loadSessionState();
    const rawState = session?.state ?? "UNKNOWN";
    const highLevel =
      rawState === "IDLE" && session?.watchedChannelName
        ? "WATCHING"
        : rawState !== "IDLE" && rawState !== "EXIT"
          ? "MAINTENANCE"
          : rawState;
    const status = {
      running: rawState !== "EXIT",
      state: highLevel,
      rawState,
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

