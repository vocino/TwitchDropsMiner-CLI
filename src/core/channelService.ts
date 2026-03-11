import { Channel } from "../domain/channel.js";
import { DropsCampaign } from "../domain/inventory.js";
import { GQL_OPERATIONS } from "../integrations/gqlOperations.js";
import { gqlRequest } from "../integrations/gqlClient.js";
import { sortChannelCandidates, canWatchChannel } from "../domain/channel.js";
import { logger } from "./runtime.js";

export const MAX_CHANNELS = 100;

type Json = Record<string, unknown>;

/**
 * Parse Twitch GQL DirectoryPage_Game response into Channel list.
 * Expects structure: data.game.streams.edges[].node with broadcaster(s), viewersCount, game.
 */
export function parseGameDirectoryResponse(
  response: unknown,
  gameName: string,
  aclBased: boolean
): Channel[] {
  const data = (response as Json)?.data as Json | undefined;
  const game = data?.game as Json | undefined;
  const streams = game?.streams as Json | undefined;
  const edges = (streams?.edges as Json[] | undefined) ?? [];
  const channels: Channel[] = [];

  for (const edge of edges) {
    const node = edge?.node as Json | undefined;
    if (!node) continue;

    let broadcasters: Json[] = Array.isArray(node.broadcasters) ? (node.broadcasters as Json[]) : [];
    if (broadcasters.length === 0 && node.broadcaster != null) {
      broadcasters = [node.broadcaster as Json];
    }
    const broadcaster = broadcasters[0] as Json | undefined;
    if (!broadcaster) continue;

    const id = String(broadcaster.id ?? broadcaster.login ?? "");
    const login = String(broadcaster.login ?? broadcaster.displayName ?? id);
    if (!id || !login) continue;

    const viewers = Number(node.viewersCount ?? node.viewerCount ?? 0);
    const gameNode = node.game as Json | undefined;
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

export interface ChannelServiceOptions {
  wantedGames: string[];
  campaigns: DropsCampaign[];
  maxChannels?: number;
}

/**
 * Build ACL-based channel IDs from campaigns (campaign allowlist / tags if present in GQL).
 * For now campaigns do not expose channel allowlist in our GQL shape; return empty set.
 */
export function getAclChannelIdsFromCampaigns(_campaigns: DropsCampaign[]): Set<string> {
  const ids = new Set<string>();
  // When GQL provides campaign channel allowlist, add those ids here.
  return ids;
}

/**
 * Fetch channels for wanted games via GameDirectory GQL, merge and cap to maxChannels.
 * ACL channels (from campaign allowlist) are marked and preferred in sorting elsewhere.
 */
/**
 * Resolve game name to Twitch directory slug (from campaigns when available).
 */
function gameNameToSlug(gameName: string, campaigns: DropsCampaign[]): string {
  const c = campaigns.find((camp) => camp.gameName === gameName);
  return c ? c.gameSlug : gameName.toLowerCase().replace(/\s+/g, "-");
}

export async function fetchChannelsForWantedGames(
  token: string,
  options: ChannelServiceOptions
): Promise<Channel[]> {
  const { wantedGames, campaigns, maxChannels = MAX_CHANNELS } = options;
  const aclIds = getAclChannelIdsFromCampaigns(campaigns);
  const byId = new Map<string, Channel>();

  for (const gameName of wantedGames) {
    const slug = gameNameToSlug(gameName, campaigns);
    const response = await gqlRequest<unknown>(
      GQL_OPERATIONS.GameDirectory,
      token,
      {
        slug,
        limit: 30,
        sortTypeIsRecency: false,
        includeCostreaming: false
      }
    );
    const resp = response as Json;
    const gqlErrors = resp?.errors as unknown[] | undefined;
    if (gqlErrors?.length) {
      logger.warn({ gameName, slug, gqlErrors }, "GameDirectory GQL errors");
    }
    const aclBased = false;
    const list = parseGameDirectoryResponse(response, gameName, aclBased);
    for (const ch of list) {
      const existing = byId.get(ch.id);
      const acl = aclIds.has(ch.id);
      const merged: Channel = {
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
