import { GQL_OPERATIONS } from "../integrations/gqlOperations.js";
import { gqlRequest } from "../integrations/gqlClient.js";
import { sortChannelCandidates, canWatchChannel } from "../domain/channel.js";
import { logger } from "./runtime.js";
import { mapWithConcurrency } from "./concurrency.js";
import { loadConfig } from "../config/store.js";
export const MAX_CHANNELS = 100;
/**
 * Parse Twitch GQL DirectoryPage_Game response into Channel list.
 * Expects structure: data.game.streams.edges[].node with broadcaster(s), viewersCount, game.
 */
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
        const displayGame = gameNode
            ? String(gameNode.displayName ?? gameNode.name ?? gameName)
            : gameName;
        const streamId = node.id != null ? String(node.id) : undefined;
        channels.push({
            id,
            login,
            online: true,
            viewers: Number.isFinite(viewers) ? viewers : 0,
            gameName: displayGame,
            dropsEnabled: node.isDropsEnabled === false ? false : true,
            aclBased,
            streamId
        });
    }
    return channels;
}
/**
 * Build ACL-based channel IDs from campaigns (campaign allowlist / tags if present in GQL).
 * For now campaigns do not expose channel allowlist in our GQL shape; return empty set.
 */
export function getAclChannelIdsFromCampaigns(_campaigns) {
    const ids = new Set();
    // When GQL provides campaign channel allowlist, add those ids here.
    return ids;
}
/**
 * Resolve game name to Twitch directory slug (from campaigns when available).
 */
function gameNameToSlug(gameName, campaigns) {
    const c = campaigns.find((camp) => camp.gameName === gameName);
    return c ? c.gameSlug : gameName.toLowerCase().replace(/\s+/g, "-");
}
export async function fetchChannelsForWantedGames(token, options) {
    const { wantedGames, campaigns, maxChannels = MAX_CHANNELS } = options;
    const gql = options.gqlRequestImpl ??
        ((op, t, v) => gqlRequest(op, t, v));
    const concurrency = options.fetchConcurrency ?? loadConfig().channelFetchConcurrency;
    const aclIds = getAclChannelIdsFromCampaigns(campaigns);
    const byId = new Map();
    const rows = await mapWithConcurrency(wantedGames, concurrency, async (gameName) => {
        const slug = gameNameToSlug(gameName, campaigns);
        const response = await gql(GQL_OPERATIONS.GameDirectory, token, {
            slug,
            limit: 30,
            sortTypeIsRecency: false,
            includeCostreaming: false
        });
        return { gameName, slug, response };
    });
    for (const { gameName, slug, response } of rows) {
        const resp = response;
        const gqlErrors = resp?.errors;
        if (gqlErrors?.length) {
            logger.warn({ gameName, slug, gqlErrors }, "GameDirectory GQL errors");
        }
        const aclBased = false;
        const list = parseGameDirectoryResponse(response, gameName, aclBased);
        for (const ch of list) {
            const existing = byId.get(ch.id);
            const acl = aclIds.has(ch.id);
            const merged = {
                ...ch,
                aclBased: existing?.aclBased ?? acl
            };
            if (!existing || merged.viewers > existing.viewers) {
                byId.set(ch.id, merged);
            }
        }
    }
    let result = Array.from(byId.values());
    result = result.filter((ch) => canWatchChannel(ch, wantedGames));
    result = sortChannelCandidates(result, wantedGames);
    return result.slice(0, maxChannels);
}
