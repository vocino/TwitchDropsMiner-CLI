import { GQL_OPERATIONS } from "../integrations/gqlOperations.js";
import { gqlRequest } from "../integrations/gqlClient.js";
import { mapWithConcurrency } from "./concurrency.js";
import { logger } from "./runtime.js";
/**
 * Pick campaigns that need a details fetch: active/upcoming, in the priority list,
 * not excluded, and not already carrying drop data.
 */
export function selectPriorityCampaignIds(campaignsResponse, priority, exclude = []) {
    const root = campaignsResponse.data?.currentUser;
    const list = root?.dropCampaigns ?? [];
    const wanted = new Set(priority);
    const skipped = new Set(exclude);
    const ids = [];
    for (const campaign of list) {
        const status = String(campaign.status ?? "");
        if (status !== "ACTIVE" && status !== "UPCOMING") {
            continue;
        }
        const existing = campaign.timeBasedDrops;
        if (Array.isArray(existing) && existing.length > 0) {
            continue;
        }
        const game = campaign.game ?? {};
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
export async function fetchCampaignDetails(req) {
    const details = {};
    if (req.campaignIds.length === 0) {
        return details;
    }
    const results = await mapWithConcurrency(req.campaignIds, req.concurrency ?? 4, async (campaignId) => {
        try {
            const res = await gqlRequest(GQL_OPERATIONS.CampaignDetails, req.token, {
                channelLogin: req.channelLogin,
                dropID: campaignId
            });
            const user = res.data?.user;
            const campaign = user?.dropCampaign;
            return campaign?.id ? campaign : null;
        }
        catch (err) {
            logger.warn({ campaignId, err: err.message }, "DropCampaignDetails fetch failed; campaign keeps zero drops this cycle");
            return null;
        }
    });
    for (const campaign of results) {
        if (campaign) {
            details[String(campaign.id)] = campaign;
        }
    }
    return details;
}
