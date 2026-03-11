import { Command } from "@commander-js/extra-typings";
import { SessionManager } from "../../auth/sessionManager.js";
import { GQL_OPERATIONS } from "../../integrations/gqlOperations.js";
import { gqlRequest } from "../../integrations/gqlClient.js";
import { buildInventoryFromGqlResponses } from "../../domain/inventory.js";
import { loadConfig, saveConfig } from "../../config/store.js";

export const gamesCommand = new Command("games")
  .description("List available drop campaigns/games from Twitch (use these names in priority)")
  .option("--json", "Output as JSON")
  .option("--add <gameName>", "Add a game name to config priority and save")
  .action(async (opts) => {
    const session = new SessionManager();
    const token = session.getAccessToken();
    if (!token) {
      // eslint-disable-next-line no-console
      console.error("Not logged in. Run: tdm auth login --no-open");
      process.exitCode = 1;
      return;
    }

    await session.validateAccessToken(token);

    const [inventoryResponse, campaignsResponse] = await Promise.all([
      gqlRequest<Record<string, unknown>>(GQL_OPERATIONS.Inventory, token),
      gqlRequest<Record<string, unknown>>(GQL_OPERATIONS.Campaigns, token)
    ]);

    const cfg = loadConfig();
    const built = buildInventoryFromGqlResponses(
      inventoryResponse as unknown as Record<string, unknown>,
      campaignsResponse as unknown as Record<string, unknown>,
      { enableBadgesEmotes: cfg.enableBadgesEmotes }
    );

    const rows = built.campaigns.map((c) => ({
      gameName: c.gameName,
      campaignName: c.name,
      status: c.active ? "active" : c.upcoming ? "upcoming" : "expired",
      eligible: c.eligible
    }));

    if (opts.add) {
      const name = String(opts.add).trim();
      const match = built.campaigns.find(
        (c) => c.gameName === name || c.gameName.toLowerCase() === name.toLowerCase()
      );
      if (!match) {
        // eslint-disable-next-line no-console
        console.error(
          `No campaign found for "${name}". Use exact game name from list (e.g. tdm games).`
        );
        process.exitCode = 1;
        return;
      }
      const next = loadConfig();
      const priority = [...next.priority];
      if (!priority.includes(match.gameName)) {
        priority.push(match.gameName);
        saveConfig({ ...next, priority });
        // eslint-disable-next-line no-console
        console.log(`Added "${match.gameName}" to priority. Current priority: ${JSON.stringify(priority)}`);
      } else {
        // eslint-disable-next-line no-console
        console.log(`"${match.gameName}" already in priority.`);
      }
      return;
    }

    if (opts.json) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(rows, null, 2));
      return;
    }

    if (rows.length === 0) {
      // eslint-disable-next-line no-console
      console.log("No drop campaigns found. Link game accounts at https://www.twitch.tv/drops/campaigns");
      return;
    }

    // eslint-disable-next-line no-console
    console.log("Available games (use exact gameName in: tdm config set priority '[\"Game Name\"]')");
    // eslint-disable-next-line no-console
    console.log("---");
    for (const r of rows) {
      const elig = r.eligible ? "eligible" : "not-eligible";
      // eslint-disable-next-line no-console
      console.log(`${r.gameName}\t${r.status}\t${elig}\t# ${r.campaignName}`);
    }
    // eslint-disable-next-line no-console
    console.log("---");
    // eslint-disable-next-line no-console
    console.log(
      "To mine a game: tdm config set priority '[\"" + rows[0].gameName + "\"]'   (or use --add)"
    );
  });
