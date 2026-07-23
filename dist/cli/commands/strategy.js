import { Command } from "@commander-js/extra-typings";
import { loadConfig } from "../../config/store.js";
import { gqlRequest } from "../../integrations/gqlClient.js";
import { GQL_OPERATIONS } from "../../integrations/gqlOperations.js";
import { buildInventoryFromGqlResponses } from "../../domain/inventory.js";
import { summarizeHistory } from "../../ops/history.js";
async function fetchAllCampaigns() {
    const fs = await import("node:fs");
    const authPath = `${process.env.HOME}/.config/tdm/auth.json`;
    const raw = JSON.parse(fs.readFileSync(authPath, "utf8"));
    const token = raw.accessToken;
    const inventoryResponse = await gqlRequest(GQL_OPERATIONS.Inventory, token);
    const campaignsResponse = await gqlRequest(GQL_OPERATIONS.Campaigns, token);
    const cfg = loadConfig();
    const built = buildInventoryFromGqlResponses(inventoryResponse, campaignsResponse, { enableBadgesEmotes: cfg.enableBadgesEmotes });
    return built.campaigns;
}
export const calendarCommand = new Command("calendar")
    .description("Drops calendar — upcoming/ending campaigns with timing")
    .option("--upcoming", "Only upcoming/not yet started", false)
    .option("--active", "Only active earnable now", false)
    .option("--json", "JSON output", false)
    .option("--days <n>", "Look ahead N days (default 14)", "14")
    .action(async (opts) => {
    const days = Math.max(1, Number(opts.days) || 14);
    const campaigns = await fetchAllCampaigns();
    const now = new Date();
    const horizon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    let filtered = campaigns.filter((c) => {
        if (c.endsAt.getTime() < now.getTime())
            return false;
        if (c.startsAt.getTime() > horizon.getTime())
            return false;
        if (c.drops.length === 0)
            return false; // skip empty (badges-only) campaigns
        return true;
    });
    if (opts.upcoming)
        filtered = filtered.filter((c) => c.upcoming);
    if (opts.active)
        filtered = filtered.filter((c) => c.active && c.eligible);
    filtered.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    const entries = filtered.map((c) => ({
        game: c.gameName,
        campaignName: c.name,
        campaignId: c.id,
        startsAt: c.startsAt.toISOString(),
        endsAt: c.endsAt.toISOString(),
        availability: Number.isFinite(c.availability) ? Number(c.availability.toFixed(2)) : 9999,
        eligible: c.eligible,
        active: c.active,
        upcoming: c.upcoming,
        expired: c.expired,
        drops: c.drops.length,
        remaining: c.firstDrop?.totalRemainingMinutes ?? 0,
        status: c.upcoming ? "UPCOMING" : c.active ? "ACTIVE" : c.expired ? "EXPIRED" : "IDLE"
    }));
    if (opts.json) {
        console.log(JSON.stringify(entries, null, 2));
        return;
    }
    console.log(`Calendar — next ${days}d — ${entries.length} campaigns (active ${filtered.filter((c) => c.active).length}, upcoming ${filtered.filter((c) => c.upcoming).length})`);
    console.log("Starts               Ends                 Avail   Rem   Game / Campaign");
    console.log("-".repeat(95));
    for (const e of entries) {
        const sd = e.startsAt.slice(0, 16).replace("T", " ");
        const ed = e.endsAt.slice(0, 16).replace("T", " ");
        const av = String(e.availability).padStart(6);
        const rem = `${e.remaining}m`.padStart(6);
        const status = e.status.padEnd(9);
        console.log(`${sd}  ${ed}  ${av}  ${rem}  [${status}] ${e.game} — ${e.campaignName}`);
    }
});
export const optimizeCommand = new Command("optimize")
    .description("Suggest optimal priority order for drops based on remaining, availability, history")
    .option("--json", "JSON", false)
    .option("--mode <mode>", "ending_soonest|low_avbl_first|history (default history)", "history")
    .action(async (opts) => {
    const campaigns = await fetchAllCampaigns();
    const history = summarizeHistory();
    const mode = String(opts.mode || "history");
    const now = new Date();
    const earnable = campaigns.filter((c) => c.canEarnWithin(new Date(now.getTime() + 60 * 60 * 1000)));
    const scored = earnable.map((c) => {
        const first = c.firstDrop;
        const remaining = first?.totalRemainingMinutes ?? 0;
        const required = first?.totalRequiredMinutes ?? 0;
        const rawAvail = c.availability;
        const availability = Number.isFinite(rawAvail) ? rawAvail : 999;
        const endsAt = c.endsAt;
        const histMins = history.perGame[c.gameName] ?? 0;
        let score = 0;
        let reason = "";
        if (mode === "ending_soonest") {
            score = -(endsAt.getTime() - now.getTime());
            const hrs = Math.round((endsAt.getTime() - now.getTime()) / 3600000);
            reason = `ends in ${hrs}h`;
        }
        else if (mode === "low_avbl_first") {
            score = -availability;
            reason = `availability ${availability.toFixed(2)} (lower = scarcer)`;
        }
        else {
            const availScore = Math.max(0, 100 - Math.min(availability, 100)) * 2;
            const remainScore = Math.max(0, 100 - Math.min(remaining, 500)) * 0.5;
            const histPenalty = histMins * 0.1;
            score = availScore + remainScore - histPenalty;
            reason = `avail ${availability.toFixed(1)} + ${remaining}m left - ${histMins}m hist`;
        }
        return {
            game: c.gameName,
            campaignName: c.name,
            remaining,
            required,
            availability,
            endsAt: endsAt.toISOString(),
            historyMins: histMins,
            score,
            reason
        };
    });
    if (mode === "ending_soonest") {
        scored.sort((a, b) => new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime());
    }
    else if (mode === "low_avbl_first") {
        scored.sort((a, b) => a.availability - b.availability);
    }
    else {
        scored.sort((a, b) => b.score - a.score);
    }
    if (opts.json) {
        console.log(JSON.stringify(scored, null, 2));
        return;
    }
    console.log(`Optimize — mode=${mode} — ${scored.length} earnable campaigns`);
    console.log("Pri  Game                  Remain  Avail    History  Reason");
    console.log("-".repeat(92));
    scored.forEach((s, i) => {
        console.log(`${String(i + 1).padStart(3)}  ${s.game.padEnd(20)} ${String(s.remaining).padStart(6)}m ${s.availability.toFixed(2).padStart(6)}  ${String(s.historyMins).padStart(7)}m  ${s.reason}`);
    });
    if (scored.length > 0) {
        console.log("\nSuggested priority order:");
        console.log(`  tdm config set priority ${scored.map((s) => `"${s.game}"`).join(" ")}`);
    }
});
export const simulateCommand = new Command("simulate")
    .description("Simulate earnings for next N hours given current priority + channel counts")
    .option("--hours <n>", "Hours to simulate (default 24)", "24")
    .option("--json", "JSON", false)
    .action(async (opts) => {
    const hours = Math.max(1, Number(opts.hours) || 24);
    const campaigns = await fetchAllCampaigns();
    const cfg = loadConfig();
    const priority = cfg.priority;
    const now = new Date();
    const earnable = campaigns.filter((c) => c.canEarnWithin(new Date(now.getTime() + hours * 60 * 60 * 1000)));
    const sims = [];
    const sorted = [...earnable].sort((a, b) => {
        const ia = priority.indexOf(a.gameName);
        const ib = priority.indexOf(b.gameName);
        const pa = ia === -1 ? 1000 : ia;
        const pb = ib === -1 ? 1000 : ib;
        if (pa !== pb)
            return pa - pb;
        return a.endsAt.getTime() - b.endsAt.getTime();
    });
    let cumHours = 0;
    for (const c of sorted) {
        const first = c.firstDrop;
        if (!first)
            continue;
        const rem = first.totalRemainingMinutes ?? 0;
        if (rem <= 0)
            continue;
        const remHours = rem / 60;
        cumHours += remHours;
        if (cumHours <= hours) {
            sims.push({
                game: c.gameName,
                campaign: c.name,
                remaining: rem,
                willCompleteInHours: Number(cumHours.toFixed(2)),
                willClaim: c.drops.filter((d) => !d.isClaimed).map((d) => d.name).slice(0, 3)
            });
        }
    }
    if (opts.json) {
        console.log(JSON.stringify({ hours, priority, campaigns: sims }, null, 2));
        return;
    }
    console.log(`Simulate — next ${hours}h — priority ${priority.length ? priority.join(", ") : "(none, using ending_soonest)"}`);
    console.log(`Earnable: ${earnable.length}, will complete ${sims.length} in ${hours}h with 1x speed`);
    console.log("-".repeat(80));
    let total = 0;
    for (const s of sims) {
        total += s.remaining;
        console.log(`${s.game.padEnd(20)} ${String(s.remaining).padStart(4)}m remaining -> completes at +${s.willCompleteInHours}h | claims: ${s.willClaim.join(", ")}`);
    }
    console.log(`Total to earn: ${total}m (${(total / 60).toFixed(1)}h)`);
    if (sims.length === 0) {
        console.log("Nothing completable in window — try --hours 72 or adjust priority");
    }
});
