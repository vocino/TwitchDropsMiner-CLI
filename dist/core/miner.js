import { StateMachine } from "./stateMachine.js";
import { WatchLoop } from "./watchLoop.js";
import { MaintenanceScheduler } from "./maintenance.js";
import { SessionManager } from "../auth/sessionManager.js";
import { GQL_OPERATIONS } from "../integrations/gqlOperations.js";
import { gqlRequest } from "../integrations/gqlClient.js";
import { canWatchChannel, sortChannelCandidates, shouldSwitchChannel } from "../domain/channel.js";
import { fetchChannelsForWantedGames } from "./channelService.js";
import { sendChannelWatch } from "../integrations/twitchSpade.js";
import { saveSessionState } from "../state/sessionState.js";
import { logger } from "./runtime.js";
import { buildInventoryFromGqlResponses } from "../domain/inventory.js";
import { loadConfig } from "../config/store.js";
import { TwitchPubSub } from "../integrations/twitchPubSub.js";
import { WS_TOPICS_LIMIT } from "./constants.js";
export class Miner {
    state = new StateMachine();
    watchLoop = new WatchLoop();
    maintenance = new MaintenanceScheduler();
    running = false;
    config = null;
    campaigns = [];
    timeTriggers = [];
    wantedGames = [];
    channels = [];
    watchingChannel = null;
    userId = null;
    lastInventoryFetchHour = 0;
    spadeUrlCache = new Map();
    pubsub = null;
    dryRun = false;
    signalHandlersAttached = false;
    onShutdownSignal = () => {
        void this.shutdown();
    };
    async run(options) {
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
        this.state.setState("INVENTORY_FETCH");
        await this.tickState(token);
        this.pubsub = new TwitchPubSub();
        await this.pubsub.start();
        this.setupPubSubHandlers(token);
        this.subscribePubSub(token);
        this.watchLoop.start(async () => {
            if (this.state.state !== "IDLE") {
                await this.tickState(token);
            }
            if (!this.watchingChannel || !this.userId) {
                return;
            }
            if (this.dryRun) {
                logger.info(`[dry-run] Would send watch for channel ${this.watchingChannel.login} (id=${this.watchingChannel.id})`);
            }
            else {
                const ok = await sendChannelWatch(this.watchingChannel, this.userId, token, {
                    spadeUrlCache: this.spadeUrlCache
                });
                if (ok) {
                    logger.info(`Watch tick sent for channel ${this.watchingChannel.login}`);
                }
                else {
                    logger.warn(`Watch tick failed for channel ${this.watchingChannel.login}`);
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
    async shutdown() {
        this.detachSignalHandlers();
        this.running = false;
        this.watchLoop.stop();
        this.maintenance.stop();
        if (this.pubsub) {
            await this.pubsub.stop();
            this.pubsub = null;
        }
        this.state.setState("EXIT");
        saveSessionState({
            state: "EXIT",
            activeDropId: this.getActiveDropText() ?? undefined,
            updatedAt: new Date().toISOString(),
            watchedChannelId: this.watchingChannel?.id,
            watchedChannelName: this.watchingChannel?.login
        });
    }
    attachSignalHandlers() {
        if (this.signalHandlersAttached) {
            return;
        }
        this.signalHandlersAttached = true;
        process.on("SIGINT", this.onShutdownSignal);
        process.on("SIGTERM", this.onShutdownSignal);
    }
    detachSignalHandlers() {
        if (!this.signalHandlersAttached) {
            return;
        }
        process.off("SIGINT", this.onShutdownSignal);
        process.off("SIGTERM", this.onShutdownSignal);
        this.signalHandlersAttached = false;
    }
    async claimEligibleDrops(token) {
        for (const campaign of this.campaigns) {
            for (const drop of campaign.drops) {
                if (!drop.canClaim || !drop.dropInstanceId)
                    continue;
                if (this.dryRun) {
                    logger.info(`[dry-run] Would claim drop ${drop.name} (instanceId=${drop.dropInstanceId})`);
                    continue;
                }
                try {
                    await gqlRequest(GQL_OPERATIONS.ClaimDrop, token, {
                        input: { dropInstanceID: drop.dropInstanceId }
                    });
                    drop.markClaimed();
                    logger.info({ dropId: drop.id, instanceId: drop.dropInstanceId }, "Claimed drop");
                }
                catch (err) {
                    logger.warn({ err, dropId: drop.id }, "Claim drop failed");
                }
            }
        }
    }
    getActiveDropText() {
        for (const campaign of this.campaigns) {
            const first = campaign.firstDrop;
            if (first)
                return `${campaign.gameName}: ${first.name}`;
        }
        return null;
    }
    findDropByInstanceId(instanceId) {
        for (const campaign of this.campaigns) {
            for (const drop of campaign.drops) {
                if (drop.dropInstanceId === instanceId)
                    return drop;
            }
        }
        return null;
    }
    setupPubSubHandlers(token) {
        if (!this.pubsub || !this.userId)
            return;
        const userDropsTopic = `user-drop-events.${this.userId}`;
        const notificationsTopic = `onsite-notifications.${this.userId}`;
        this.pubsub.registerTopic(userDropsTopic, (msg) => {
            const type = msg.type;
            if (type === "drop-progress") {
                const data = msg.data;
                const instanceId = data?.drop_instance_id ?? data?.dropInstanceID;
                const minutes = Number(data?.current_progress_minutes ?? data?.currentMinutesWatched ?? 0);
                if (instanceId && Number.isFinite(minutes)) {
                    const drop = this.findDropByInstanceId(String(instanceId));
                    if (drop) {
                        drop.updateMinutes(minutes);
                        logger.debug({ instanceId, minutes }, "Drop progress from PubSub");
                    }
                }
            }
            else if (type === "drop-claim" || type === "drop_claim") {
                const data = msg.data;
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
    subscribePubSub(token) {
        if (!this.pubsub || !this.userId)
            return;
        const userTopics = [
            `user-drop-events.${this.userId}`,
            `onsite-notifications.${this.userId}`
        ];
        const channelTopics = this.channels
            .slice(0, Math.max(0, WS_TOPICS_LIMIT - userTopics.length))
            .map((ch) => `video-playback-by-id.${ch.id}`);
        for (const topic of channelTopics) {
            this.pubsub.registerTopic(topic, () => {
                logger.debug("Stream state update, requesting channels cleanup");
                this.state.setState("CHANNELS_CLEANUP");
            });
        }
        this.pubsub.listen(userTopics, token);
        if (channelTopics.length > 0) {
            this.pubsub.listen(channelTopics, token);
        }
    }
    async tickState(token) {
        if (!this.running) {
            return;
        }
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
    }
    async fetchInventory(token) {
        const inventoryResponse = await gqlRequest(GQL_OPERATIONS.Inventory, token);
        const campaignsResponse = await gqlRequest(GQL_OPERATIONS.Campaigns, token);
        const cfg = this.config ?? loadConfig();
        const built = buildInventoryFromGqlResponses(inventoryResponse, campaignsResponse, { enableBadgesEmotes: cfg.enableBadgesEmotes });
        this.campaigns = built.campaigns;
        this.timeTriggers = built.timeTriggers;
        logger.debug({
            campaigns: this.campaigns.map((c) => ({
                id: c.id,
                game: c.gameName,
                eligible: c.eligible,
                active: c.active,
                upcoming: c.upcoming
            }))
        }, "Inventory fetched and campaigns built");
    }
    updateWantedGames() {
        // Reload config from disk so we always use latest priority (e.g. after tdm games --add or manual edit).
        const cfg = loadConfig();
        const exclude = new Set(cfg.exclude);
        const priority = cfg.priority;
        const priorityMode = cfg.priorityMode;
        const priorityOnly = priorityMode === "priority_only";
        const nextHour = new Date(Date.now() + 60 * 60 * 1000);
        const earnable = this.campaigns.filter((c) => c.canEarnWithin(nextHour));
        if (earnable.length === 0 && this.campaigns.length > 0) {
            logger.warn({
                totalCampaigns: this.campaigns.length,
                campaignGames: this.campaigns.slice(0, 5).map((c) => ({
                    game: c.gameName,
                    eligible: c.eligible,
                    active: c.active,
                    canEarnWithin: c.canEarnWithin(nextHour)
                })),
                priority,
                priorityMode
            }, "No campaigns passed canEarnWithin; check campaign dates/eligibility");
        }
        let campaigns = earnable;
        if (!priorityOnly) {
            if (priorityMode === "ending_soonest") {
                campaigns = campaigns.sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime());
            }
            else if (priorityMode === "low_avbl_first") {
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
        const wanted = [];
        for (const campaign of campaigns) {
            const game = campaign.gameName;
            if (wanted.includes(game))
                continue;
            if (exclude.has(game))
                continue;
            if (priorityOnly && !priority.includes(game))
                continue;
            wanted.push(game);
        }
        // If priority_only and we have priority set but no earnable campaign was in the list,
        // still add priority games that exist in our campaign list so we fetch channels for them.
        if (wanted.length === 0 && priorityOnly && priority.length > 0) {
            const campaignGameNames = new Set(this.campaigns.map((c) => c.gameName));
            for (const game of priority) {
                if (exclude.has(game))
                    continue;
                if (campaignGameNames.has(game)) {
                    wanted.push(game);
                }
            }
            if (wanted.length > 0) {
                logger.debug({ addedFromPriority: wanted }, "No earnable campaigns in priority; using priority games for channel fetch");
            }
        }
        this.wantedGames = wanted;
        logger.info({ wantedGames: this.wantedGames }, "Updated wanted games");
    }
    cleanupChannels() {
        this.channels = this.channels.filter((ch) => canWatchChannel(ch, this.wantedGames));
        if (this.watchingChannel && !canWatchChannel(this.watchingChannel, this.wantedGames)) {
            this.watchingChannel = null;
        }
    }
    async fetchChannels(token) {
        if (this.wantedGames.length === 0) {
            this.channels = [];
            return;
        }
        this.channels = await fetchChannelsForWantedGames(token, {
            wantedGames: this.wantedGames,
            campaigns: this.campaigns,
            maxChannels: 100
        });
        logger.info({ count: this.channels.length, wantedGames: this.wantedGames }, "Fetched channels");
    }
    switchChannel() {
        const candidates = sortChannelCandidates(this.channels, this.wantedGames).filter((ch) => canWatchChannel(ch, this.wantedGames));
        const best = candidates[0] ?? null;
        if (best && shouldSwitchChannel(this.watchingChannel, best, this.wantedGames)) {
            this.watchingChannel = best;
            logger.info(`Watching channel: ${this.watchingChannel.login}`);
        }
        else if (!this.watchingChannel && best) {
            this.watchingChannel = best;
            logger.info(`Watching channel: ${this.watchingChannel.login}`);
        }
        else if (!best) {
            this.watchingChannel = null;
            logger.info("No channel candidates available.");
        }
    }
}
