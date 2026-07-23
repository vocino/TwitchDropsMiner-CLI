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

test("TimedDrop canClaim false when past 24h window", () => {
  const now = new Date();
  const campaignRaw = {
    id: "c1b",
    name: "Expired Campaign",
    game: { name: "GameA", slug: "gamea" },
    self: { isAccountConnected: true },
    startAt: new Date(now.getTime() - 30 * 60 * 60 * 1000).toISOString(),
    endAt: new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString(),
    status: "ACTIVE",
    timeBasedDrops: [
      {
        id: "d1",
        name: "Drop1",
        startAt: new Date(now.getTime() - 30 * 60 * 60 * 1000).toISOString(),
        endAt: new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString(),
        requiredMinutesWatched: 30,
        benefitEdges: [{ benefit: { id: "b1", name: "Reward", distributionType: "DIRECT_ENTITLEMENT", imageAssetURL: "" } }],
        self: { dropInstanceID: "inst1", isClaimed: false, currentMinutesWatched: 30 },
        preconditionDrops: []
      }
    ]
  };
  const campaign = new DropsCampaign(campaignRaw as any, {}, true);
  const drop = Array.from(campaign.timedDrops.values())[0] as TimedDrop;
  assert.equal(drop.canClaim, false);
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

test("TimedDrop preconditionsMet blocks earn until preconditions claimed", () => {
  const now = new Date();
  const campaignRaw = {
    id: "c3",
    name: "Chain Campaign",
    game: { name: "GameC", slug: "gamec" },
    self: { isAccountConnected: true },
    startAt: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
    endAt: new Date(now.getTime() + 50 * 60 * 1000).toISOString(),
    status: "ACTIVE",
    timeBasedDrops: [
      {
        id: "pre1",
        name: "First Drop",
        startAt: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
        endAt: new Date(now.getTime() + 50 * 60 * 1000).toISOString(),
        requiredMinutesWatched: 15,
        benefitEdges: [{ benefit: { id: "bPre", name: "PreReward", distributionType: "DIRECT_ENTITLEMENT", imageAssetURL: "" } }],
        self: { dropInstanceID: "instPre", isClaimed: false, currentMinutesWatched: 5 },
        preconditionDrops: []
      },
      {
        id: "dChain",
        name: "Second Drop",
        startAt: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
        endAt: new Date(now.getTime() + 50 * 60 * 1000).toISOString(),
        requiredMinutesWatched: 30,
        benefitEdges: [{ benefit: { id: "bChain", name: "ChainReward", distributionType: "DIRECT_ENTITLEMENT", imageAssetURL: "" } }],
        self: { dropInstanceID: null, isClaimed: false, currentMinutesWatched: 0 },
        preconditionDrops: [{ id: "pre1" }]
      }
    ]
  };

  const campaign = new DropsCampaign(campaignRaw as any, {}, true);
  const pre = campaign.timedDrops.get("pre1") as TimedDrop;
  const chained = campaign.timedDrops.get("dChain") as TimedDrop;

  // Before claiming pre, chained cannot earn (preconditionsMet false)
  assert.equal(chained.preconditionsMet, false);
  assert.equal(chained.canEarn(now), false);

  // After claiming pre, chained can earn
  pre.markClaimed();
  assert.equal(chained.preconditionsMet, true);
  assert.equal(chained.canEarn(now), true);
});

test("TimedDrop canEarnWithin respects preconditions (mirrors upstream _base_earn_conditions)", () => {
  const now = new Date();
  const campaignRaw = {
    id: "c4",
    name: "Within Chain",
    game: { name: "GameD", slug: "gamed" },
    self: { isAccountConnected: true },
    startAt: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
    endAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    status: "ACTIVE",
    timeBasedDrops: [
      {
        id: "a",
        name: "A",
        startAt: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
        endAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
        requiredMinutesWatched: 10,
        benefitEdges: [{ benefit: { id: "bA", name: "RA", distributionType: "DIRECT_ENTITLEMENT", imageAssetURL: "" } }],
        self: { dropInstanceID: null, isClaimed: false, currentMinutesWatched: 0 },
        preconditionDrops: []
      },
      {
        id: "b",
        name: "B",
        startAt: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
        endAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
        requiredMinutesWatched: 10,
        benefitEdges: [{ benefit: { id: "bB", name: "RB", distributionType: "DIRECT_ENTITLEMENT", imageAssetURL: "" } }],
        self: { dropInstanceID: null, isClaimed: false, currentMinutesWatched: 0 },
        preconditionDrops: [{ id: "a" }]
      }
    ]
  };
  const campaign = new DropsCampaign(campaignRaw as any, {}, true);
  const b = campaign.timedDrops.get("b") as TimedDrop;
  const future = new Date(now.getTime() + 30 * 60 * 1000);
  assert.equal(b.canEarnWithin(future), false, "should be blocked by unclaimed precondition");
  (campaign.timedDrops.get("a") as TimedDrop).markClaimed();
  assert.equal(b.canEarnWithin(future), true, "after claiming pre, canEarnWithin should be true");
});
