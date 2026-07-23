import { Command } from "@commander-js/extra-typings";
import { loadSessionState } from "../../state/sessionState.js";
import { isMinerLockHeldByLiveProcess } from "../../core/runtime.js";
import { getHistoryPaths, summarizeHistory } from "../../ops/history.js";
import { getMetricsJSON } from "../../ops/metrics.js";

const SESSION_FRESH_MS = 120_000;

function sessionImpliesRunning(
  rawState: string,
  updatedAt: string | undefined
): boolean {
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
  .option("--verbose", "Verbose output (shows session file path, device id)", false)
  .action(async (opts) => {
    const session = loadSessionState();
    const rawState = session?.state ?? "UNKNOWN";
    const highLevel =
      rawState === "IDLE" && session?.watchedChannelName
        ? "WATCHING"
        : rawState !== "IDLE" && rawState !== "EXIT"
          ? "MAINTENANCE"
          : rawState;
    const lockHeld = isMinerLockHeldByLiveProcess();
    const running =
      lockHeld || sessionImpliesRunning(rawState, session?.updatedAt);

    let historySummary: ReturnType<typeof summarizeHistory> | null = null;
    let metrics: ReturnType<typeof getMetricsJSON> | null = null;
    let paths: ReturnType<typeof getHistoryPaths> | null = null;
    try {
      paths = getHistoryPaths();
    } catch {}
    try {
      historySummary = summarizeHistory();
    } catch {}
    try {
      metrics = getMetricsJSON();
    } catch {}

    const status = {
      running,
      lockHeld,
      state: highLevel,
      rawState,
      watchedChannel: session?.watchedChannelName ?? null,
      watchedChannelId: (session as any)?.watchedChannelId ?? null,
      activeDrop: session?.activeDropId ?? null,
      updatedAt: session?.updatedAt ?? null,
      sessionAgeMs: session?.updatedAt ? Date.now() - new Date(session.updatedAt).getTime() : null,
      stale: session?.updatedAt ? Date.now() - new Date(session.updatedAt).getTime() > SESSION_FRESH_MS : null,
      parity: {
        maxChannels: 199,
        maxWebsockets: 8,
        pool: "8x50 sharded"
      },
      observability: {
        history: historySummary,
        metrics: metrics ? { version: (metrics as any).version, uptimeSeconds: (metrics as any).uptimeSeconds, minutesPerGame: (metrics as any).minutesPerGame } : null,
        paths
      }
    };

    if (opts.json) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(status, null, 2));
    } else {
      const v = opts.verbose ? " (verbose)" : "";
      // eslint-disable-next-line no-console
      console.log(
        `Running=${status.running}, lock=${status.lockHeld}, state=${status.state}, channel=${status.watchedChannel ?? "-"} (id=${status.watchedChannelId ?? "-"}), activeDrop=${status.activeDrop ?? "-"}, updated=${status.updatedAt ?? "-"}${v}`
      );
      // eslint-disable-next-line no-console
      console.log(`Parity: MAX_CHANNELS=199 pool=8x50 GQL=11 ops spade=upstream-aligned`);
      if (historySummary) {
        // eslint-disable-next-line no-console
        console.log(
          `History: backend=${paths?.backend ?? "?"} totalTicks=${historySummary.totalTicks} from=${historySummary.fromTs ?? "-"} to=${historySummary.toTs ?? "-"}`
        );
      }
      if (metrics) {
        // eslint-disable-next-line no-console
        console.log(`Metrics: uptime=${(metrics as any).uptimeSeconds ?? 0}s version=${(metrics as any).version ?? "?"}`);
      }
    }
  });
