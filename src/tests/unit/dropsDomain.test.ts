import test from "node:test";
import assert from "node:assert/strict";
import { DropsCampaign, TimedDrop } from "../../domain/inventory.js";

test("TimedDrop canClaim respects 24h post-campaign window", () => {
  const now = new Date();
  const campaignRaw = {
    id: "c1",
    name: "Test Campaign",
    game: { name: "GameA", slug: "gamea" },
    self: { isAccountConnected: true },
    startAt: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
    endAt: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
    status: "ACTIVE",
    timeBasedDrops: [
      {
        id: "d1",
        name: "Drop1",
        startAt: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
        endAt: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
        requiredMinutesWatched: 30,
        benefitEdges: [{ benefit: { id: "b1", name: "Reward", distributionType: "DIRECT_ENTITLEMENT", imageAssetURL: "" } }],
        self: { dropInstanceID: "inst1", isClaimed: false, currentMinutesWatched: 30 },
        preconditionDrops: []
      }
    ]
  };

  const campaign = new DropsCampaign(campaignRaw as any, {}, true);
  const drop = Array.from(campaign.timedDrops.values())[0] as TimedDrop;
  assert.equal(drop.canClaim, true);
});

test("DropsCampaign canEarnWithin filters by timeframe and eligibility", () => {
  const now = new Date();
  const campaignRaw = {
    id: "c2",
    name: "Test Campaign 2",
    game: { name: "GameB", slug: "gameb" },
    self: { isAccountConnected: true },
    startAt: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
    endAt: new Date(now.getTime() + 50 * 60 * 1000).toISOString(),
    status: "ACTIVE",
    timeBasedDrops: [
      {
        id: "d2",
        name: "Drop2",
        startAt: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
        endAt: new Date(now.getTime() + 50 * 60 * 1000).toISOString(),
        requiredMinutesWatched: 30,
        benefitEdges: [{ benefit: { id: "b2", name: "Reward", distributionType: "DIRECT_ENTITLEMENT", imageAssetURL: "" } }],
        self: { dropInstanceID: null, isClaimed: false, currentMinutesWatched: 0 },
        preconditionDrops: []
      }
    ]
  };

  const campaign = new DropsCampaign(campaignRaw as any, {}, true);
  const stamp = new Date(now.getTime() + 30 * 60 * 1000);
  assert.equal(campaign.canEarnWithin(stamp), true);
});

