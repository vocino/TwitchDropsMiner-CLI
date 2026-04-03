import { Command } from "@commander-js/extra-typings";
import { loadSessionState } from "../../state/sessionState.js";
import { isMinerLockHeldByLiveProcess } from "../../core/runtime.js";
const SESSION_FRESH_MS = 120_000;
function sessionImpliesRunning(rawState, updatedAt) {
    if (rawState === "EXIT" || rawState === "UNKNOWN") {
        return false;
    }
    if (!updatedAt) {
        return false;
    }
    const t = new Date(updatedAt).getTime();
    if (!Number.isFinite(t)) {
        return false;
    }
    return Date.now() - t < SESSION_FRESH_MS;
}
export const statusCommand = new Command("status")
    .description("Show current miner status")
    .option("--json", "Output status as JSON")
    .action(async (opts) => {
    const session = loadSessionState();
    const rawState = session?.state ?? "UNKNOWN";
    const highLevel = rawState === "IDLE" && session?.watchedChannelName
        ? "WATCHING"
        : rawState !== "IDLE" && rawState !== "EXIT"
            ? "MAINTENANCE"
            : rawState;
    const lockHeld = isMinerLockHeldByLiveProcess();
    const running = lockHeld || sessionImpliesRunning(rawState, session?.updatedAt);
    const status = {
        running,
        lockHeld,
        state: highLevel,
        rawState,
        watchedChannel: session?.watchedChannelName ?? null,
        activeDrop: session?.activeDropId ?? null
    };
    if (opts.json) {
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(status));
    }
    else {
        // eslint-disable-next-line no-console
        console.log(`Running=${status.running}, lock=${status.lockHeld}, state=${status.state}, channel=${status.watchedChannel ?? "-"}, activeDrop=${status.activeDrop ?? "-"}`);
    }
});
