import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchChannelsForWantedGames,
  parseSlugRedirectResponse,
  resolveGameSlug
} from "../../core/channelService.js";
import { GQL_OPERATIONS, type GqlOperation } from "../../integrations/gqlOperations.js";
import { DropsCampaign } from "../../domain/inventory.js";
function mockCampaign(name: string, slug: string): DropsCampaign {
  return { gameName: name, gameSlug: slug } as unknown as DropsCampaign;
}
test("fetchChannelsForWantedGames respects fetchConcurrency", async () => {
  let maxParallel = 0; let current = 0;
  const games = ["A","B","C","D","E","F"];
  await fetchChannelsForWantedGames("fake-token", {
    wantedGames: games, campaigns: [], fetchConcurrency: 2, resolveSlugs: false,
    gqlRequestImpl: async () => {
      current++; maxParallel = Math.max(maxParallel, current);
      await new Promise((r) => setTimeout(r, 5)); current--; return { data: { game: { streams: { edges: [] } } } };
    }
  });
  assert.equal(maxParallel, 2);
});
test("fetchChannelsForWantedGames uses GameDirectory operation", async () => {
  const seenOps: string[] = [];
  await fetchChannelsForWantedGames("t", {
    wantedGames: ["X"], campaigns: [], fetchConcurrency: 1, resolveSlugs: false,
    gqlRequestImpl: async (op) => { seenOps.push(op.operationName); return { data: { game: { streams: { edges: [] } } } }; }
  });
  assert.ok(seenOps.includes(GQL_OPERATIONS.GameDirectory.operationName));
});
test("parseSlugRedirectResponse extracts slug", () => {
  const resp = { data: { game: { slug: "just-chatting" } } };
  assert.equal(parseSlugRedirectResponse(resp), "just-chatting");
  assert.equal(parseSlugRedirectResponse({ data: {} }), null);
  assert.equal(parseSlugRedirectResponse({}), null);
});
test("resolveGameSlug uses campaign slug when resolveSlugs=false", async () => {
  const campaigns = [mockCampaign("WoW", "world-of-warcraft")];
  const slug = await resolveGameSlug("WoW", campaigns as any, "t", async () => ({ data: { game: { slug: "should-not-use" } } }), { resolveSlugs: false });
  assert.equal(slug, "world-of-warcraft");
});
test("resolveGameSlug falls back to SlugRedirect GQL", async () => {
  const slug = await resolveGameSlug("Just Chatting", [], "t", async (op: GqlOperation) => {
    if (op.operationName === GQL_OPERATIONS.SlugRedirect.operationName) return { data: { game: { slug: "just-chatting" } } };
    return { data: { game: { streams: { edges: [] } } } };
  }, { resolveSlugs: true });
  assert.equal(slug, "just-chatting");
});
test("resolveGameSlug falls back to lowercased name when GQL fails", async () => {
  const slug = await resolveGameSlug("My Game", [], "t", async () => { throw new Error("gql fail"); }, { resolveSlugs: true });
  assert.equal(slug, "my-game");
});
test("MAX_CHANNELS matches upstream 199", async () => {
  const { MAX_CHANNELS } = await import("../../core/constants.js");
  assert.equal(MAX_CHANNELS, 199);
});
test("GameDirectory uses new hash 86bcce", () => {
  assert.equal(GQL_OPERATIONS.GameDirectory.sha256Hash, "86bcceb4e8b1a51256ff8eed8bd8aae4acacf80d737efe904f84f3aeadf8cafd");
});
test("SlugRedirect operation exists with correct hash", () => {
  assert.equal(GQL_OPERATIONS.SlugRedirect.operationName, "DirectoryGameRedirect");
  assert.equal(GQL_OPERATIONS.SlugRedirect.sha256Hash, "1f0300090caceec51f33c5e20647aceff9017f740f223c3c532ba6fa59f6b6cc");
});
