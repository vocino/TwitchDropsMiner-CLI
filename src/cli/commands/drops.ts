import { Command } from "@commander-js/extra-typings";
import { loadConfig } from "../../config/store.js";
import { gqlRequest } from "../../integrations/gqlClient.js";
import { GQL_OPERATIONS } from "../../integrations/gqlOperations.js";
import { buildInventoryFromGqlResponses, type Json } from "../../domain/inventory.js";
import { loadAuthState } from "../../state/authStore.js";

export const dropsCommand = new Command("drops")
  .description("Show detailed drops progress (remaining, claimable, preconditions)")
  .option("--json", "JSON output", false)
  .option("--claimable", "Only show claimable drops", false)
  .option("--game <name>", "Filter by game name substring")
  .action(async (opts) => {
    const auth = loadAuthState();
    if (!auth?.accessToken) {
      console.error("Not authenticated. Run tdm auth login first.");
      process.exitCode = 2;
      return;
    }
    const cfg = loadConfig();
    const invResp = (await gqlRequest(GQL_OPERATIONS.Inventory, auth.accessToken)) as unknown as Json;
    const campsResp = (await gqlRequest(GQL_OPERATIONS.Campaigns, auth.accessToken)) as unknown as Json;
    const built = buildInventoryFromGqlResponses(invResp, campsResp, { enableBadgesEmotes: cfg.enableBadgesEmotes });

    let entries: any[] = [];
    for (const c of built.campaigns) {
      if (opts.game && !c.gameName.toLowerCase().includes(opts.game.toLowerCase())) continue;
      for (const d of c.drops) {
        if (opts.claimable && !d.canClaim) continue;
        entries.push({
          game: c.gameName,
          campaignId: c.id,
          campaignName: (c as any).name ?? c.id,
          eligible: c.eligible,
          active: c.active,
          expired: c.expired,
          drop: d.name,
          dropId: d.id,
          claimed: d.isClaimed,
          canClaim: d.canClaim,
          canEarn: d.canEarn(),
          precondMet: d.preconditionsMet,
          remaining: d.remainingMinutes,
          required: d.requiredMinutes,
          requiredTotal: d.totalRequiredMinutes,
          progress: Number(d.progress.toFixed(3)),
          availability: Number.isFinite(d.availability) ? Number(d.availability.toFixed(2)) : null,
          preconditionIds: [...d.preconditionDropIds],
          instanceId: d.dropInstanceId ?? null
        });
      }
    }

    entries.sort((a, b) => {
      if (a.canClaim !== b.canClaim) return a.canClaim ? -1 : 1;
      if (a.claimed !== b.claimed) return a.claimed ? 1 : -1;
      return a.remaining - b.remaining;
    });

    if (opts.json as boolean) {
      console.log(JSON.stringify(entries, null, 2));
    } else {
      if (entries.length === 0) {
        console.log((opts.claimable as boolean) ? "No claimable drops right now." : "No drops matched.");
        return;
      }
      for (const e of entries) {
        const flag = e.canClaim ? "CLAIMABLE" : e.claimed ? "claimed" : e.canEarn ? `${e.remaining}m left` : "locked";
        const pre = e.preconditionIds.length ? ` pre=${e.preconditionIds.length} met=${e.precondMet}` : "";
        console.log(`${flag.padEnd(12)} ${e.game} | ${e.drop} | ${e.remaining}/${e.required} (${(e.progress * 100).toFixed(1)}%)${pre}`);
      }
    }
  });
