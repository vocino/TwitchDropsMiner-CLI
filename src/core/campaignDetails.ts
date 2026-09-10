import { GQL_OPERATIONS } from "../integrations/gqlOperations.js";
import { gqlRequest } from "../integrations/gqlClient.js";
import { mapWithConcurrency } from "./concurrency.js";
import { logger } from "./runtime.js";
import type { Json } from "../domain/inventory.js";

/**
 * The Campaigns (ViewerDropsDashboard) query returns campaign metadata WITHOUT
 * `timeBasedDrops`, so any campaign the user has no inventory progress on ends up
 * with zero drops. `DropsCampaign.canEarnWithin` requires `drops.some(...)`, so those
 * campaigns are silently skipped and never become wanted games — priority order never
 * even gets a chance to sort them.
 *
 * `DropCampaignDetails` fills in `timeBasedDrops` (plus the `allow` ACL) per campaign.
 * We only fetch it for campaigns whose game is in the user's priority list, to keep the
 * extra GQL requests bounded.
 */

export interface CampaignDetailsRequest {
  token: string;
  channelLogin: string;
  campaignIds: readonly string[];
  concurrency?: number;
}

/**
 * Pick campaigns that need a details fetch: active/upcoming, in the priority list,
 * not excluded, and not already carrying drop data.
 */
export function selectPriorityCampaignIds(
  campaignsResponse: Json,
  priority: readonly string[],
  exclude: readonly string[] = []
): string[] {
  const root = (campaignsResponse.data as Json | undefined)?.currentUser as Json | undefined;
  const list = (root?.dropCampaigns as Json[] | undefined) ?? [];
  const wanted = new Set(priority);
  const skipped = new Set(exclude);
  const ids: string[] = [];

  for (const campaign of list) {
    const status = String(campaign.status ?? "");
    if (status !== "ACTIVE" && status !== "UPCOMING") {
      continue;
    }
    const existing = campaign.timeBasedDrops as Json[] | undefined;
    if (Array.isArray(existing) && existing.length > 0) {
      continue;
    }
    const game = (campaign.game as Json | undefined) ?? {};
    const gameName = String(game.name ?? game.displayName ?? "");
    if (!wanted.has(gameName) || skipped.has(gameName)) {
      continue;
    }
    const id = String(campaign.id ?? "");
    if (id) {
      ids.push(id);
    }
  }

  return ids;
}

/**
 * Fetch `DropCampaignDetails` for each id, keyed by campaign id. A failed fetch is
 * logged and dropped rather than thrown — a single bad campaign must not take down the
 * whole inventory cycle.
 */
export async function fetchCampaignDetails(
  req: CampaignDetailsRequest
): Promise<Record<string, Json>> {
  const details: Record<string, Json> = {};
  if (req.campaignIds.length === 0) {
    return details;
  }

  const results = await mapWithConcurrency(
    req.campaignIds,
    req.concurrency ?? 4,
    async (campaignId) => {
      try {
        const res = await gqlRequest<Json>(GQL_OPERATIONS.CampaignDetails, req.token, {
          channelLogin: req.channelLogin,
          dropID: campaignId
        });
        const user = (res.data as Json | undefined)?.user as Json | undefined;
        const campaign = user?.dropCampaign as Json | undefined;
        return campaign?.id ? campaign : null;
      } catch (err) {
        logger.warn(
          { campaignId, err: (err as Error).message },
          "DropCampaignDetails fetch failed; campaign keeps zero drops this cycle"
        );
        return null;
      }
    }
  );

  for (const campaign of results) {
    if (campaign) {
      details[String(campaign.id)] = campaign;
    }
  }

  return details;
}
