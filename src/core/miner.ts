import { StateMachine } from "./stateMachine.js";
import { WatchLoop } from "./watchLoop.js";
import { MaintenanceScheduler } from "./maintenance.js";
import { SessionManager } from "../auth/sessionManager.js";
import { GQL_OPERATIONS } from "../integrations/gqlOperations.js";
import { gqlRequest } from "../integrations/gqlClient.js";
import { Channel, canWatchChannel, sortChannelCandidates } from "../domain/channel.js";
import { saveSessionState } from "../state/sessionState.js";
import { logger } from "./runtime.js";
import { buildInventoryFromGqlResponses, DropsCampaign } from "../domain/inventory.js";
import { loadConfig } from "../config/store.js";

export class Miner {
  private state = new StateMachine();
  private watchLoop = new WatchLoop();
  private maintenance = new MaintenanceScheduler();
  private running = false;
  private config: ReturnType<typeof loadConfig> | null = null;
  private campaigns: DropsCampaign[] = [];
  private wantedGames: string[] = [];
  private channels: Channel[] = [];
  private watchingChannel: Channel | null = null;

  async run(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;

    this.config = loadConfig();

    const session = new SessionManager();
    const token = session.getAccessToken();
    if (!token) {
      throw new Error("Missing auth token. Run `tdm auth login --no-open` first.");
    }

    await session.validateAccessToken(token);
    logger.info("Auth validated. Starting miner.");

    this.state.setState("INVENTORY_FETCH");
    await this.tickState(token);

    this.watchLoop.start(async () => {
      if (!this.watchingChannel) {
        return;
      }
      logger.info(`Watch heartbeat for channel ${this.watchingChannel.login}`);
      saveSessionState({
        state: this.state.state,
        watchedChannelId: this.watchingChannel.id,
        watchedChannelName: this.watchingChannel.login,
        updatedAt: new Date().toISOString()
      });
    });

    this.maintenance.start(60 * 60 * 1000, async () => {
      logger.info("Maintenance trigger: inventory refresh");
      this.state.setState("INVENTORY_FETCH");
      await this.tickState(token);
    });

    process.on("SIGINT", () => {
      void this.shutdown();
    });
    process.on("SIGTERM", () => {
      void this.shutdown();
    });
  }

  async shutdown(): Promise<void> {
    this.running = false;
    this.watchLoop.stop();
    this.maintenance.stop();
    this.state.setState("EXIT");
    saveSessionState({
      state: "EXIT",
      updatedAt: new Date().toISOString(),
      watchedChannelId: this.watchingChannel?.id,
      watchedChannelName: this.watchingChannel?.login
    });
  }

  private async tickState(token: string): Promise<void> {
    if (!this.running) {
      return;
    }

    if (this.state.state === "INVENTORY_FETCH") {
      await this.fetchInventory(token);
      this.state.setState("GAMES_UPDATE");
    }
    if (this.state.state === "GAMES_UPDATE") {
      this.updateWantedGames();
      this.state.setState("CHANNELS_CLEANUP");
    }
    if (this.state.state === "CHANNELS_CLEANUP") {
      this.cleanupChannels();
      this.state.setState("CHANNELS_FETCH");
    }
    if (this.state.state === "CHANNELS_FETCH") {
      await this.fetchChannels(token);
      this.state.setState("CHANNEL_SWITCH");
    }
    if (this.state.state === "CHANNEL_SWITCH") {
      this.switchChannel();
      this.state.setState(this.watchingChannel ? "IDLE" : "CHANNELS_FETCH");
    }
  }

  private async fetchInventory(token: string): Promise<void> {
    const inventoryResponse = await gqlRequest<Record<string, unknown>>(
      GQL_OPERATIONS.Inventory,
      token
    );
    const campaignsResponse = await gqlRequest<Record<string, unknown>>(
      GQL_OPERATIONS.Campaigns,
      token
    );
    const cfg = this.config ?? loadConfig();
    const built = buildInventoryFromGqlResponses(
      (inventoryResponse as unknown) as Record<string, unknown>,
      (campaignsResponse as unknown) as Record<string, unknown>,
      { enableBadgesEmotes: cfg.enableBadgesEmotes }
    );
    this.campaigns = built.campaigns;
    logger.debug(
      {
        campaigns: this.campaigns.map((c) => ({
          id: c.id,
          game: c.gameName,
          eligible: c.eligible,
          active: c.active,
          upcoming: c.upcoming
        }))
      },
      "Inventory fetched and campaigns built"
    );
  }

  private updateWantedGames(): void {
    const cfg = this.config ?? loadConfig();
    const exclude = new Set(cfg.exclude);
    const priority = cfg.priority;
    const priorityMode = cfg.priorityMode;
    const priorityOnly = priorityMode === "priority_only";

    const nextHour = new Date(Date.now() + 60 * 60 * 1000);
    let campaigns = this.campaigns.filter((c) => c.canEarnWithin(nextHour));

    if (!priorityOnly) {
      if (priorityMode === "ending_soonest") {
        campaigns = campaigns.sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime());
      } else if (priorityMode === "low_avbl_first") {
        campaigns = campaigns.sort((a, b) => a.availability - b.availability);
      }
    }

    campaigns = campaigns.sort((a, b) => {
      const ia = priority.indexOf(a.gameName);
      const ib = priority.indexOf(b.gameName);
      const pa = ia === -1 ? Number.MAX_SAFE_INTEGER : ia;
      const pb = ib === -1 ? Number.MAX_SAFE_INTEGER : ib;
      return pa - pb;
    });

    const wanted: string[] = [];
    for (const campaign of campaigns) {
      const game = campaign.gameName;
      if (wanted.includes(game)) continue;
      if (exclude.has(game)) continue;
      if (priorityOnly && !priority.includes(game)) continue;
      wanted.push(game);
    }

    this.wantedGames = wanted;
    logger.info({ wantedGames: this.wantedGames }, "Updated wanted games");
  }

  private cleanupChannels(): void {
    this.channels = this.channels.filter((ch) => canWatchChannel(ch, this.wantedGames));
  }

  private async fetchChannels(token: string): Promise<void> {
    // Placeholder: query a generic directory for the first wanted game.
    const slug = this.wantedGames[0]?.toLowerCase().replace(/\s+/g, "-") ?? "just-chatting";
    await gqlRequest(GQL_OPERATIONS.GameDirectory, token, { slug, limit: 30 });
    // In parity stages this will map real channel payloads.
    this.channels = [
      {
        id: "1",
        login: "placeholder_channel",
        online: true,
        viewers: 1000,
        gameName: this.wantedGames[0],
        dropsEnabled: true
      }
    ];
  }

  private switchChannel(): void {
    const candidates = sortChannelCandidates(this.channels, this.wantedGames).filter((ch) =>
      canWatchChannel(ch, this.wantedGames)
    );
    this.watchingChannel = candidates[0] ?? null;
    if (this.watchingChannel) {
      logger.info(`Watching channel: ${this.watchingChannel.login}`);
    } else {
      logger.info("No channel candidates available.");
    }
  }
}

