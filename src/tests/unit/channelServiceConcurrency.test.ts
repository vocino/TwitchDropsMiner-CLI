import test from "node:test";
import assert from "node:assert/strict";
import { fetchChannelsForWantedGames } from "../../core/channelService.js";
import { GQL_OPERATIONS, type GqlOperation } from "../../integrations/gqlOperations.js";

test("fetchChannelsForWantedGames respects fetchConcurrency", async () => {
  let maxParallel = 0;
  let current = 0;
  const games = ["A", "B", "C", "D", "E", "F"];
  await fetchChannelsForWantedGames("fake-token", {
    wantedGames: games,
    campaigns: [],
    fetchConcurrency: 2,
    gqlRequestImpl: async (_op: GqlOperation, _token: string, _vars?: Record<string, unknown>) => {
      current += 1;
      maxParallel = Math.max(maxParallel, current);
      await new Promise((r) => setTimeout(r, 5));
      current -= 1;
      return { data: { game: { streams: { edges: [] } } } };
    }
  });
  assert.equal(maxParallel, 2);
});

test("fetchChannelsForWantedGames uses GameDirectory operation", async () => {
  let seenOp!: GqlOperation;
  await fetchChannelsForWantedGames("t", {
    wantedGames: ["X"],
    campaigns: [],
    fetchConcurrency: 1,
    gqlRequestImpl: async (op) => {
      seenOp = op;
      return { data: { game: { streams: { edges: [] } } } };
    }
  });
  assert.equal(seenOp.operationName, GQL_OPERATIONS.GameDirectory.operationName);
});
