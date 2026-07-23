import { Channel } from "../domain/channel.js";
import { DropsCampaign } from "../domain/inventory.js";
import { GQL_OPERATIONS, type GqlOperation } from "../integrations/gqlOperations.js";
import { gqlRequest } from "../integrations/gqlClient.js";
import { sortChannelCandidates, canWatchChannel } from "../domain/channel.js";
import { logger } from "./runtime.js";
import { mapWithConcurrency } from "./concurrency.js";
import { loadConfig } from "../config/store.js";
import { MAX_CHANNELS } from "./constants.js";

export { MAX_CHANNELS };

type Json = Record<string, unknown>;

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
    const displayGame = gameNode ? String(gameNode.displayName ?? gameNode.name ?? gameName) : gameName;
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

export function parseSlugRedirectResponse(response: unknown): string | null {
  const data = (response as Json)?.data as Json | undefined;
  if (!data) return null;
  const game = data.game as Json | undefined;
  if (!game) return null;
  const slug = game.slug as string | undefined;
  if (slug && typeof slug === "string" && slug.length > 0) return slug;
  return null;
}

export interface ChannelServiceOptions {
  wantedGames: string[];
  campaigns: DropsCampaign[];
  maxChannels?: number;
  fetchConcurrency?: number;
  gqlRequestImpl?: (
    operation: GqlOperation,
    token: string,
    variables?: Record<string, unknown>
  ) => Promise<unknown>;
  resolveSlugs?: boolean;
}

export function getAclChannelIdsFromCampaigns(_campaigns: DropsCampaign[]): Set<string> {
  const ids = new Set<string>();
  for (const c of _campaigns as unknown as Json[]) {
    const raw = (c as Json)?.allowlistChannelIds as unknown;
    if (Array.isArray(raw)) {
      for (const id of raw as string[]) if (typeof id === "string") ids.add(id);
    }
  }
  return ids;
}

export async function resolveGameSlug(
  gameName: string,
  campaigns: DropsCampaign[],
  token: string,
  gql: (operation: GqlOperation, token: string, variables?: Record<string, unknown>) => Promise<unknown>,
  options?: { resolveSlugs?: boolean }
): Promise<string> {
  const c = campaigns.find((camp) => camp.gameName === gameName);
  if (options?.resolveSlugs === false) return c ? c.gameSlug : gameName.toLowerCase().replace(/\s+/g, "-");
  try {
    const resp = await gql(GQL_OPERATIONS.SlugRedirect, token, { name: gameName });
    const slug = parseSlugRedirectResponse(resp);
    if (slug) {
      logger.debug({ gameName, slug }, "Resolved game slug via SlugRedirect");
      return slug;
    }
  } catch (err) {
    logger.debug({ err, gameName }, "SlugRedirect failed, using fallback slug");
  }
  return c ? c.gameSlug : gameName.toLowerCase().replace(/\s+/g, "-");
}

export async function fetchChannelsForWantedGames(
  token: string,
  options: ChannelServiceOptions
): Promise<Channel[]> {
  const { wantedGames, campaigns, maxChannels = MAX_CHANNELS } = options;
  const gql =
    options.gqlRequestImpl ??
    ((op: GqlOperation, t: string, v?: Record<string, unknown>) => gqlRequest<unknown>(op, t, v));
  const concurrency = options.fetchConcurrency ?? loadConfig().channelFetchConcurrency;
  const shouldResolveSlugs = options.resolveSlugs !== false;
  const aclIds = getAclChannelIdsFromCampaigns(campaigns);
  const byId = new Map<string, Channel>();
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
    const resp = response as Json;
    const gqlErrors = resp?.errors as unknown[] | undefined;
    if (gqlErrors?.length) logger.warn({ gameName, slug, gqlErrors }, "GameDirectory GQL errors");
    const list = parseGameDirectoryResponse(response, gameName, false);
    for (const ch of list) {
      const existing = byId.get(ch.id);
      const acl = aclIds.has(ch.id);
      const merged: Channel = { ...ch, aclBased: (existing?.aclBased || ch.aclBased || acl) as boolean };
      if (!existing || merged.viewers > existing.viewers) byId.set(ch.id, merged);
    }
  }
  let result = Array.from(byId.values());
  result = result.filter((ch) => canWatchChannel(ch, wantedGames));
  result = sortChannelCandidates(result, wantedGames);
  return result.slice(0, maxChannels);
}
