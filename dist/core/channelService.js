import { GQL_OPERATIONS } from "../integrations/gqlOperations.js";
import { gqlRequest } from "../integrations/gqlClient.js";
import { sortChannelCandidates, canWatchChannel } from "../domain/channel.js";
import { logger } from "./runtime.js";
import { mapWithConcurrency } from "./concurrency.js";
import { loadConfig } from "../config/store.js";
import { MAX_CHANNELS } from "./constants.js";
export { MAX_CHANNELS };
export function parseGameDirectoryResponse(response, gameName, aclBased) {
    const data = response?.data;
    const game = data?.game;
    const streams = game?.streams;
    const edges = streams?.edges ?? [];
    const channels = [];
    for (const edge of edges) {
        const node = edge?.node;
        if (!node)
            continue;
        let broadcasters = Array.isArray(node.broadcasters) ? node.broadcasters : [];
        if (broadcasters.length === 0 && node.broadcaster != null) {
            broadcasters = [node.broadcaster];
        }
        const broadcaster = broadcasters[0];
        if (!broadcaster)
            continue;
        const id = String(broadcaster.id ?? broadcaster.login ?? "");
        const login = String(broadcaster.login ?? broadcaster.displayName ?? id);
        if (!id || !login)
            continue;
        const viewers = Number(node.viewersCount ?? node.viewerCount ?? 0);
        const gameNode = node.game;
        const displayGame = gameNode ? String(gameNode.displayName ?? gameNode.name ?? gameName) : gameName;
        const gameId = gameNode?.id != null ? String(gameNode.id) : undefined;
        const streamId = node.id != null ? String(node.id) : undefined;
        channels.push({
            id,
            login,
            online: true,
            viewers: Number.isFinite(viewers) ? viewers : 0,
            gameName: displayGame,
            gameId,
            dropsEnabled: node.isDropsEnabled === false ? false : true,
            aclBased,
            streamId
        });
    }
    return channels;
}
export function parseSlugRedirectResponse(response) {
    const data = response?.data;
    if (!data)
        return null;
    const game = data.game;
    if (!game)
        return null;
    const slug = game.slug;
    if (slug && typeof slug === "string" && slug.length > 0)
        return slug;
    return null;
}
export function getAclChannelIdsFromCampaigns(_campaigns) {
    const ids = new Set();
    for (const c of _campaigns) {
        const raw = c?.allowlistChannelIds;
        if (Array.isArray(raw)) {
            for (const id of raw)
                if (typeof id === "string")
                    ids.add(id);
        }
    }
    return ids;
}
export async function resolveGameSlug(gameName, campaigns, token, gql, options) {
    const c = campaigns.find((camp) => camp.gameName === gameName);
    if (options?.resolveSlugs === false)
        return c ? c.gameSlug : gameName.toLowerCase().replace(/\s+/g, "-");
    try {
        const resp = await gql(GQL_OPERATIONS.SlugRedirect, token, { name: gameName });
        const slug = parseSlugRedirectResponse(resp);
        if (slug) {
            logger.debug({ gameName, slug }, "Resolved game slug via SlugRedirect");
            return slug;
        }
    }
    catch (err) {
        logger.debug({ err, gameName }, "SlugRedirect failed, using fallback slug");
    }
    return c ? c.gameSlug : gameName.toLowerCase().replace(/\s+/g, "-");
}
export async function fetchChannelsForWantedGames(token, options) {
    const { wantedGames, campaigns, maxChannels = MAX_CHANNELS } = options;
    const gql = options.gqlRequestImpl ??
        ((op, t, v) => gqlRequest(op, t, v));
    const concurrency = options.fetchConcurrency ?? loadConfig().channelFetchConcurrency;
    const shouldResolveSlugs = options.resolveSlugs !== false;
    const aclIds = getAclChannelIdsFromCampaigns(campaigns);
    const byId = new Map();
    const rows = await mapWithConcurrency(wantedGames, concurrency, async (gameName) => {
        const slug = await resolveGameSlug(gameName, campaigns, token, gql, { resolveSlugs: shouldResolveSlugs });
        const response = await gql(GQL_OPERATIONS.GameDirectory, token, {
            slug,
            limit: 30,
            imageWidth: 50,
            includeCostreaming: false,
            options: {
                broadcasterLanguages: [],
                freeformTags: null,
                includeRestricted: ["SUB_ONLY_LIVE"],
                recommendationsContext: { platform: "web" },
                sort: "RELEVANCE",
                systemFilters: [],
                tags: [],
                requestID: "JIRA-VXP-2397"
            },
            sortTypeIsRecency: false
        });
        return { gameName, slug, response };
    });
    for (const { gameName, slug, response } of rows) {
        const resp = response;
        const gqlErrors = resp?.errors;
        if (gqlErrors?.length)
            logger.warn({ gameName, slug, gqlErrors }, "GameDirectory GQL errors");
        const list = parseGameDirectoryResponse(response, gameName, false);
        for (const ch of list) {
            const existing = byId.get(ch.id);
            const acl = aclIds.has(ch.id);
            const merged = { ...ch, aclBased: (existing?.aclBased || ch.aclBased || acl) };
            if (!existing || merged.viewers > existing.viewers)
                byId.set(ch.id, merged);
        }
    }
    let result = Array.from(byId.values());
    result = result.filter((ch) => canWatchChannel(ch, wantedGames));
    result = sortChannelCandidates(result, wantedGames);
    return result.slice(0, maxChannels);
}
