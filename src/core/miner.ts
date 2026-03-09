import { StateMachine } from "./stateMachine.js";
import { WatchLoop } from "./watchLoop.js";
import { MaintenanceScheduler } from "./maintenance.js";
import { SessionManager } from "../auth/sessionManager.js";
import { GQL_OPERATIONS } from "../integrations/gqlOperations.js";
import { gqlRequest } from "../integrations/gqlClient.js";
import { Channel, canWatchChannel, sortChannelCandidates } from "../domain/channel.js";
import { saveSessionState } from "../state/sessionState.js";
import { logger } from "./runtime.js";

export class Miner {
  private state = new StateMachine();
  private watchLoop = new WatchLoop();
  private maintenance = new MaintenanceScheduler();
  private running = false;
  private wantedGames: string[] = [];
  private channels: Channel[] = [];
  private watchingChannel: Channel | null = null;

  async run(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;

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
    logger.debug({ inventoryResponse, campaignsResponse }, "Inventory fetched");
  }

  private updateWantedGames(): void {
    // TODO: use full settings priority/exclude logic when config store is fully wired.
    this.wantedGames = this.wantedGames.length ? this.wantedGames : ["Just Chatting"];
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

