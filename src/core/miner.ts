import { StateMachine } from "./stateMachine.js";
import { WatchLoop } from "./watchLoop.js";
import { MaintenanceScheduler } from "./maintenance.js";
import { SessionManager } from "../auth/sessionManager.js";
import { GQL_OPERATIONS } from "../integrations/gqlOperations.js";
import { gqlRequest } from "../integrations/gqlClient.js";
import { Channel, canWatchChannel, sortChannelCandidates, shouldSwitchChannel } from "../domain/channel.js";
import { fetchChannelsForWantedGames } from "./channelService.js";
import { sendChannelWatch } from "../integrations/twitchSpade.js";
import { saveSessionState } from "../state/sessionState.js";
import { logger } from "./runtime.js";
import { buildInventoryFromGqlResponses, DropsCampaign, TimedDrop } from "../domain/inventory.js";
import { loadConfig } from "../config/store.js";
import { TwitchPubSub } from "../integrations/twitchPubSub.js";
import { MAX_CHANNELS } from "./constants.js";
import { recordTick } from "../ops/history.js";
import { metricsRegistry, setActiveDropsProvider, setStatusProvider } from "../ops/metrics.js";
import { dispatchHook } from "../ops/webhooks.js";

export class Miner {
  private state = new StateMachine();
  private watchLoop = new WatchLoop();
  private maintenance = new MaintenanceScheduler();
  private running = false;
  private config: ReturnType<typeof loadConfig> | null = null;
  private campaigns: DropsCampaign[] = [];
  private timeTriggers: Date[] = [];
  private wantedGames: string[] = [];
  private channels: Channel[] = [];
  private watchingChannel: Channel | null = null;
  private userId: string | null = null;
  private lastInventoryFetchHour: number = 0;
  private readonly spadeUrlCache = new Map<string, string>();
  private pubsub: TwitchPubSub | null = null;
  private dryRun = false;
  private signalHandlersAttached = false;
  private readonly onShutdownSignal = (): void => {
    void this.shutdown();
  };

  async run(options?: { dryRun?: boolean }): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    this.dryRun = options?.dryRun ?? false;

    this.config = loadConfig();

    const session = new SessionManager();
    const token = session.getAccessToken();
    if (!token) {
      throw new Error("Missing auth token. Run `tdm auth login --no-open` first.");
    }

    const validation = await session.validateAccessToken(token);
    this.userId = validation.user_id;
    logger.info("Auth validated. Starting miner.");

    // Wire drop status providers for /drops and /status endpoints (Glance)
    setActiveDropsProvider(() => this.getActiveDropsForApi());
    setStatusProvider(() => this.getStatusForApi());

    this.state.setState("INVENTORY_FETCH");
    await this.tickState(token);

    this.pubsub = new TwitchPubSub();
    await this.pubsub.start();
    this.setupPubSubHandlers(token);
    this.subscribePubSub(token);

    // metrics: pubsub connected after start
    metricsRegistry.setPubSubConnected(true);

    this.watchLoop.start(async () => {
      if (this.state.state !== "IDLE") {
        await this.tickState(token);
      }
      if (!this.watchingChannel || !this.userId) {
        // no watching, clear metrics watching gauge
        metricsRegistry.clearWatching();
        return;
      }

      // update watching gauge
      metricsRegistry.setWatching(
        this.watchingChannel.id,
        this.watchingChannel.login,
        this.watchingChannel.gameName ?? "unknown"
      );

      if (this.dryRun) {
        logger.info(
          `[dry-run] Would send watch for channel ${this.watchingChannel.login} (id=${this.watchingChannel.id})`
        );
      } else {
        const ok = await sendChannelWatch(this.watchingChannel, this.userId, token, {
          spadeUrlCache: this.spadeUrlCache
        });
        if (ok) {
          logger.info(`Watch tick sent for channel ${this.watchingChannel.login}`);
          metricsRegistry.incWatchTick(
            this.watchingChannel.id,
            this.watchingChannel.login,
            this.watchingChannel.gameName ?? "unknown",
            1
          );
          // History: record minute tick — always 1 minute delta, not cumulative
          recordTick({
            channelId: this.watchingChannel.id,
            channelLogin: this.watchingChannel.login,
            game: this.watchingChannel.gameName ?? "unknown",
            minutesTotal: 1
          });
          void dispatchHook("watch_tick", {
            game: this.watchingChannel.gameName ?? "unknown",
            channelLogin: this.watchingChannel.login,
            channelId: this.watchingChannel.id
          });
        } else {
          logger.warn(`Watch tick failed for channel ${this.watchingChannel.login}`);
          metricsRegistry.incWatchError();
          void dispatchHook("error", { message: `Watch tick failed for ${this.watchingChannel.login}`, channelLogin: this.watchingChannel.login });
        }
      }
      saveSessionState({
        state: this.state.state,
        watchedChannelId: this.watchingChannel.id,
        watchedChannelName: this.watchingChannel.login,
        activeDropId: this.getActiveDropText() ?? undefined,
        updatedAt: new Date().toISOString()
      });
    });

    this.maintenance.start(60 * 1000, async () => {
      const now = Date.now();
      const currentHour = Math.floor(now / (60 * 60 * 1000));
      if (currentHour > this.lastInventoryFetchHour) {
        logger.info("Maintenance: hourly inventory refresh");
        this.lastInventoryFetchHour = currentHour;
        this.state.setState("INVENTORY_FETCH");
      }
      // Also refresh every 5 min if any drop is claimable in memory but not yet claimed
      // (safety net for missed PubSub)
      const currentMinute = Math.floor(now / (60 * 1000));
      if (currentMinute % 5 === 0) {
        const hasClaimable = this.campaigns.some((c) => c.drops.some((d) => d.canClaim));
        if (hasClaimable) {
          logger.info("Maintenance: found claimable drops, triggering inventory+claim");
          this.state.setState("INVENTORY_FETCH");
        }
      }
      const pastTriggers = this.timeTriggers.filter((d) => {
        const t = d.getTime();
        return t > now - 60 * 1000 && t <= now;
      });
      if (pastTriggers.length > 0) {
        logger.info("Maintenance: campaign time trigger");
        this.state.setState("CHANNELS_CLEANUP");
      }
    });

    this.attachSignalHandlers();
  }

  async shutdown(): Promise<void> {
    this.detachSignalHandlers();
    this.running = false;
    this.watchLoop.stop();
    this.maintenance.stop();
    if (this.pubsub) {
      await this.pubsub.stop();
      this.pubsub = null;
    }
    metricsRegistry.setPubSubConnected(false);
    metricsRegistry.clearWatching();
    this.state.setState("EXIT");
    saveSessionState({
      state: "EXIT",
      activeDropId: this.getActiveDropText() ?? undefined,
      updatedAt: new Date().toISOString(),
      watchedChannelId: this.watchingChannel?.id,
      watchedChannelName: this.watchingChannel?.login
    });
  }

  private attachSignalHandlers(): void {
    if (this.signalHandlersAttached) {
      return;
    }
    this.signalHandlersAttached = true;
    process.on("SIGINT", this.onShutdownSignal);
    process.on("SIGTERM", this.onShutdownSignal);
  }

  private detachSignalHandlers(): void {
    if (!this.signalHandlersAttached) {
      return;
    }
    process.off("SIGINT", this.onShutdownSignal);
    process.off("SIGTERM", this.onShutdownSignal);
    this.signalHandlersAttached = false;
  }

  private async claimEligibleDrops(token: string): Promise<void> {
    for (const campaign of this.campaigns) {
      for (const drop of campaign.drops) {
        if (!drop.canClaim || !drop.dropInstanceId) continue;
        if (this.dryRun) {
          logger.info(
            `[dry-run] Would claim drop ${drop.name} (instanceId=${drop.dropInstanceId})`
          );
          continue;
        }
        try {
          await gqlRequest(GQL_OPERATIONS.ClaimDrop, token, {
            input: { dropInstanceID: drop.dropInstanceId }
          });
          drop.markClaimed();
          logger.info({ dropId: drop.id, instanceId: drop.dropInstanceId }, "Claimed drop");
          metricsRegistry.incClaimed(1);
          void dispatchHook("claim", {
            game: campaign.gameName,
            dropName: drop.name,
            dropId: drop.id,
            channelLogin: this.watchingChannel?.login,
            channelId: this.watchingChannel?.id,
            data: { campaignId: campaign.id, instanceId: drop.dropInstanceId }
          });
        } catch (err) {
          logger.warn({ err, dropId: drop.id }, "Claim drop failed");
          void dispatchHook("error", { message: `Claim failed for ${drop.name}`, data: { dropId: drop.id } });
        }
      }
    }
  }

  private getActiveDropText(): string | null {
    for (const campaign of this.campaigns) {
      const first = campaign.firstDrop;
      if (first) return `${campaign.gameName}: ${first.name}`;
    }
    return null;
  }

  private getActiveDropsForApi(): Array<{ game: string; name: string; progress: number; remaining: number; required: number; canClaim: boolean }> {
    const out: Array<{ game: string; name: string; progress: number; remaining: number; required: number; canClaim: boolean }> = [];
    for (const campaign of this.campaigns) {
      for (const drop of campaign.drops) {
        if (drop.isClaimed) continue;
        // only drops that can earn
        if (!drop.canEarnWithin(new Date(Date.now() + 60 * 60 * 1000))) continue;
        const remaining = drop.totalRemainingMinutes;
        const required = drop.totalRequiredMinutes;
        const progress = drop.progress;
        out.push({
          game: campaign.gameName,
          name: drop.name,
          progress,
          remaining,
          required,
          canClaim: drop.canClaim
        });
      }
    }
    // sort: claimable first, then most progress
    out.sort((a, b) => {
      if (a.canClaim !== b.canClaim) return a.canClaim ? -1 : 1;
      return b.progress - a.progress;
    });
    return out.slice(0, 10); // top 10 for dashboard
  }

  private getStatusForApi(): Record<string, unknown> {
    return {
      activeDrop: this.getActiveDropText(),
      wantedGames: this.wantedGames,
      channelsCount: this.channels.length,
      watchingChannel: this.watchingChannel ? { id: this.watchingChannel.id, login: this.watchingChannel.login, game: this.watchingChannel.gameName } : null,
      campaignsCount: this.campaigns.length,
      state: this.state.state
    };
  }

  private findDropByInstanceId(instanceId: string): TimedDrop | null {
    for (const campaign of this.campaigns) {
      for (const drop of campaign.drops) {
        if (drop.dropInstanceId === instanceId) return drop;
      }
    }
    return null;
  }

  private setupPubSubHandlers(token: string): void {
    if (!this.pubsub || !this.userId) return;
    const userDropsTopic = `user-drop-events.${this.userId}`;
    const notificationsTopic = `onsite-notifications.${this.userId}`;

    this.pubsub.registerTopic(userDropsTopic, (msg: Record<string, unknown>) => {
      const type = msg.type as string | undefined;
      if (type === "drop-progress") {
        const data = msg.data as Record<string, unknown> | undefined;
        const instanceId = data?.drop_instance_id ?? data?.dropInstanceID;
        const minutes = Number(data?.current_progress_minutes ?? data?.currentMinutesWatched ?? 0);
        if (instanceId && Number.isFinite(minutes)) {
          const drop = this.findDropByInstanceId(String(instanceId));
          if (drop) {
            drop.updateMinutes(minutes);
            logger.debug({ instanceId, minutes }, "Drop progress from PubSub");
            // If progress now completes the drop, try claim immediately (like upstream) instead of waiting hourly
            if (drop.canClaim && drop.dropInstanceId) {
              logger.info({ instanceId, dropName: drop.name }, "Drop progress complete — claiming immediately via PubSub trigger");
              // Fire async claim — don't block PubSub handler
              void (async () => {
                try {
                  await gqlRequest(GQL_OPERATIONS.ClaimDrop, token, {
                    input: { dropInstanceID: drop.dropInstanceId! }
                  });
                  drop.markClaimed();
                  logger.info({ instanceId, dropName: drop.name }, "Claimed drop via PubSub progress");
                  metricsRegistry.incClaimed(1);
                  void dispatchHook("claim", {
                    game: drop.campaign.gameName,
                    dropName: drop.name,
                    dropId: drop.id,
                    channelLogin: this.watchingChannel?.login,
                    channelId: this.watchingChannel?.id,
                    data: { campaignId: drop.campaign.id, instanceId }
                  });
                  // Refresh inventory soon to get next drop in chain
                  this.state.setState("INVENTORY_FETCH");
                } catch (err) {
                  logger.warn({ err, instanceId }, "Claim via PubSub progress failed, will retry on next inventory fetch");
                }
              })();
            }
          }
        }
      } else if (type === "drop-claim" || type === "drop_claim") {
        const data = msg.data as Record<string, unknown> | undefined;
        const instanceId = data?.drop_instance_id ?? data?.dropInstanceID;
        if (instanceId) {
          const drop = this.findDropByInstanceId(String(instanceId));
          if (drop) {
            drop.markClaimed();
            logger.info({ instanceId }, "Drop claimed from PubSub");
          }
        }
        this.state.setState("CHANNELS_CLEANUP");
      }
    });

    this.pubsub.registerTopic(notificationsTopic, () => {
      logger.debug("Onsite notification received, requesting inventory refresh");
      this.state.setState("INVENTORY_FETCH");
    });
  }

  private subscribePubSub(token: string): void {
    if (!this.pubsub || !this.userId) return;
    const userTopics = [
      `user-drop-events.${this.userId}`,
      `onsite-notifications.${this.userId}`
    ];
    // Use pool-aware channel topics: up to MAX_CHANNELS channels, 1 topic per channel for now (video-playback).
    // Optional broadcast-settings-update included via config (future). Pool handles sharding across 8 websockets.
    const sliceCap = MAX_CHANNELS; // 199 — pool will handle 50 per socket
    const channelTopics = this.channels
      .slice(0, Math.max(0, sliceCap))
      .map((ch) => `video-playback-by-id.${ch.id}`);
    // Register handlers for stream state changes
    for (const topic of channelTopics) {
      this.pubsub.registerTopic(topic, () => {
        logger.debug("Stream state update, requesting channels cleanup");
        this.state.setState("CHANNELS_CLEANUP");
      });
    }
    // Also handle broadcast-settings-update if we ever subscribe to them
    for (const ch of this.channels.slice(0, sliceCap)) {
      const t = `broadcast-settings-update.${ch.id}`;
      if (!this.pubsub.getSubscribedTopics().includes(t)) {
        this.pubsub.registerTopic(t, () => {
          logger.debug({ channelId: ch.id }, "Broadcast settings update, requesting channels cleanup");
          this.state.setState("CHANNELS_CLEANUP");
        });
      }
    }

    this.pubsub.listen(userTopics, token);
    if (channelTopics.length > 0) {
      this.pubsub.listen(channelTopics, token);
    }
  }

  private async tickState(token: string): Promise<void> {
    if (!this.running) {
      return;
    }

    try {
      if (this.state.state === "INVENTORY_FETCH") {
        await this.fetchInventory(token);
        this.lastInventoryFetchHour = Math.floor(Date.now() / (60 * 60 * 1000));
        this.state.setState("GAMES_UPDATE");
      }
      if (this.state.state === "GAMES_UPDATE") {
        await this.claimEligibleDrops(token);
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
    } catch (err) {
      const isCaptcha = err instanceof Error && err.name === "CaptchaRequiredError";
      if (isCaptcha) {
        logger.warn({ err: err instanceof Error ? err.message : String(err) }, "Captcha in tickState — backing off 5m, keeping current channel");
        // don't crash process; keep watching current channel if any, retry inventory in 5 min
        this.state.setState("IDLE");
        await new Promise((r) => setTimeout(r, 5 * 60 * 1000)).catch(() => {});
        this.state.setState("INVENTORY_FETCH");
        return;
      }
      // re-throw non-captcha so upstream logging still sees it, but prevent total crash loop via outer guard
      logger.error({ err: err instanceof Error ? err.message : String(err) }, "tickState error");
      // back off briefly and reset to inventory fetch rather than exit
      await new Promise((r) => setTimeout(r, 30_000)).catch(() => {});
      this.state.setState("INVENTORY_FETCH");
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
    this.timeTriggers = built.timeTriggers;
    metricsRegistry.incInventoryFetch();
    metricsRegistry.setCampaigns(this.campaigns.length, this.campaigns.filter((c) => c.eligible).length);
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
    // Reload config from disk so we always use latest priority (e.g. after tdm games --add or manual edit).
    const cfg = loadConfig();
    const exclude = new Set(cfg.exclude);
    const priority = cfg.priority;
    const priorityMode = cfg.priorityMode;
    const priorityOnly = priorityMode === "priority_only";

    const nextHour = new Date(Date.now() + 60 * 60 * 1000);
    const earnable = this.campaigns.filter((c) => c.canEarnWithin(nextHour));

    if (earnable.length === 0 && this.campaigns.length > 0) {
      logger.warn(
        {
          totalCampaigns: this.campaigns.length,
          campaignGames: this.campaigns.slice(0, 5).map((c) => ({
            game: c.gameName,
            eligible: c.eligible,
            active: c.active,
            canEarnWithin: c.canEarnWithin(nextHour)
          })),
          priority,
          priorityMode
        },
        "No campaigns passed canEarnWithin; check campaign dates/eligibility"
      );
    }

    let campaigns = earnable;

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

    // If priority_only and we have priority set but no earnable campaign was in the list,
    // still add priority games that exist in our campaign list so we fetch channels for them.
    if (wanted.length === 0 && priorityOnly && priority.length > 0) {
      const campaignGameNames = new Set(this.campaigns.map((c) => c.gameName));
      for (const game of priority) {
        if (exclude.has(game)) continue;
        if (campaignGameNames.has(game)) {
          wanted.push(game);
        }
      }
      if (wanted.length > 0) {
        logger.debug(
          { addedFromPriority: wanted },
          "No earnable campaigns in priority; using priority games for channel fetch"
        );
      }
    }

    this.wantedGames = wanted;
    logger.info({ wantedGames: this.wantedGames }, "Updated wanted games");
  }

  private cleanupChannels(): void {
    this.channels = this.channels.filter((ch) => canWatchChannel(ch, this.wantedGames));
    if (this.watchingChannel && !canWatchChannel(this.watchingChannel, this.wantedGames)) {
      this.watchingChannel = null;
    }
  }

  private async fetchChannels(token: string): Promise<void> {
    if (this.wantedGames.length === 0) {
      this.channels = [];
      return;
    }
    // sleep mode: when only 1 earnable campaign, reduce log spam, but still fetch
    const cfg = this.config ?? loadConfig();
    if (cfg.sleepMode && this.campaigns.length > 0) {
      const nextHour = new Date(Date.now() + 60 * 60 * 1000);
      const earnable = this.campaigns.filter((c) => c.canEarnWithin(nextHour));
      if (earnable.length <= 1 && this.channels.length > 0) {
        // keep existing channels if recent, skip fetch 4 out of 5 times to save API
        const skip = Math.random() < 0.8;
        if (skip) {
          logger.debug("Sleep mode: keeping existing channels to save API");
          return;
        }
      }
    }

    this.channels = await fetchChannelsForWantedGames(token, {
      wantedGames: this.wantedGames,
      campaigns: this.campaigns,
      maxChannels: MAX_CHANNELS
    });
    logger.info({ count: this.channels.length, wantedGames: this.wantedGames }, "Fetched channels");
  }

  private switchChannel(): void {
    const candidates = sortChannelCandidates(this.channels, this.wantedGames).filter((ch) =>
      canWatchChannel(ch, this.wantedGames)
    );
    const best = candidates[0] ?? null;
    const prev = this.watchingChannel?.login;
    if (best && shouldSwitchChannel(this.watchingChannel, best, this.wantedGames)) {
      this.watchingChannel = best;
      logger.info(`Watching channel: ${this.watchingChannel.login}`);
      if (prev && prev !== best.login) {
        void dispatchHook("channel_switch", {
          game: best.gameName ?? "unknown",
          channelLogin: best.login,
          channelId: best.id,
          message: `Switched from ${prev} to ${best.login}`,
          data: { prevChannel: prev, newChannel: best.login }
        });
      }
    } else if (!this.watchingChannel && best) {
      this.watchingChannel = best;
      logger.info(`Watching channel: ${this.watchingChannel.login}`);
    } else if (!best) {
      this.watchingChannel = null;
      logger.info("No channel candidates available.");
    }
  }
}

