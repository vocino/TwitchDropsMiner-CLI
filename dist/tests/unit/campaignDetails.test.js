import test from "node:test";
import assert from "node:assert/strict";
import { selectPriorityCampaignIds } from "../../core/campaignDetails.js";
import { buildInventoryFromGqlResponses } from "../../domain/inventory.js";
function campaignsResponse(campaigns) {
    return { data: { currentUser: { dropCampaigns: campaigns } } };
}
const emptyInventory = {
    data: { currentUser: { inventory: { dropCampaignsInProgress: [], gameEventDrops: [] } } }
};
test("selectPriorityCampaignIds picks active priority campaigns lacking drops", () => {
    const res = campaignsResponse([
        { id: "c1", status: "ACTIVE", game: { displayName: "Hearthstone" } },
        { id: "c2", status: "ACTIVE", game: { displayName: "Not Prioritized" } },
        { id: "c3", status: "UPCOMING", game: { displayName: "Overwatch 2" } }
    ]);
    const ids = selectPriorityCampaignIds(res, ["Hearthstone", "Overwatch 2"]);
    assert.deepEqual(ids, ["c1", "c3"]);
});
test("selectPriorityCampaignIds skips expired, excluded, and already-populated campaigns", () => {
    const res = campaignsResponse([
        { id: "expired", status: "EXPIRED", game: { displayName: "Hearthstone" } },
        { id: "excluded", status: "ACTIVE", game: { displayName: "EVE Online" } },
        {
            id: "hasDrops",
            status: "ACTIVE",
            game: { displayName: "Hearthstone" },
            timeBasedDrops: [{ id: "d1" }]
        },
        { id: "wanted", status: "ACTIVE", game: { displayName: "Hearthstone" } }
    ]);
    const ids = selectPriorityCampaignIds(res, ["Hearthstone", "EVE Online"], ["EVE Online"]);
    assert.deepEqual(ids, ["wanted"]);
});
test("selectPriorityCampaignIds accepts game.name as well as displayName", () => {
    const res = campaignsResponse([{ id: "c1", status: "ACTIVE", game: { name: "Diablo IV" } }]);
    assert.deepEqual(selectPriorityCampaignIds(res, ["Diablo IV"]), ["c1"]);
});
test("campaign without details has zero drops and cannot be earned (regression)", () => {
    const now = Date.now();
    const res = campaignsResponse([
        {
            id: "c1",
            name: "HS Worlds",
            status: "ACTIVE",
            game: { displayName: "Hearthstone", id: "138585" },
            self: { isAccountConnected: true },
            startAt: new Date(now - 3600_000).toISOString(),
            endAt: new Date(now + 3600_000).toISOString()
        }
    ]);
    const built = buildInventoryFromGqlResponses(emptyInventory, res, { enableBadgesEmotes: false });
    assert.equal(built.campaigns.length, 1);
    assert.equal(built.campaigns[0].drops.length, 0);
    assert.equal(built.campaigns[0].canEarnWithin(new Date(now + 3600_000)), false);
});
test("merged campaignDetails restore drops so the campaign becomes earnable", () => {
    const now = Date.now();
    const start = new Date(now - 3600_000).toISOString();
    const end = new Date(now + 3600_000).toISOString();
    const res = campaignsResponse([
        {
            id: "c1",
            name: "HS Worlds",
            status: "ACTIVE",
            game: { displayName: "Hearthstone", id: "138585" },
            self: { isAccountConnected: true },
            startAt: start,
            endAt: end
        }
    ]);
    const details = {
        c1: {
            id: "c1",
            name: "HS Worlds",
            status: "ACTIVE",
            game: { displayName: "Hearthstone", id: "138585" },
            self: { isAccountConnected: true },
            startAt: start,
            endAt: end,
            allow: { channels: [{ id: "42776357", name: "playhearthstone" }] },
            timeBasedDrops: [
                {
                    id: "drop1",
                    name: "Violet Hold Pack",
                    startAt: start,
                    endAt: end,
                    requiredMinutesWatched: 60,
                    preconditionDrops: [],
                    benefitEdges: [
                        { benefit: { id: "b1", name: "Pack", distributionType: "DIRECT_ENTITLEMENT" } }
                    ],
                    self: { currentMinutesWatched: 0, isClaimed: false, dropInstanceID: null }
                }
            ]
        }
    };
    const built = buildInventoryFromGqlResponses(emptyInventory, res, {
        enableBadgesEmotes: false,
        campaignDetails: details
    });
    assert.equal(built.campaigns.length, 1);
    const campaign = built.campaigns[0];
    assert.equal(campaign.drops.length, 1);
    assert.equal(campaign.eligible, true);
    assert.equal(campaign.canEarnWithin(new Date(now + 3600_000)), true);
    // ACL from the details payload must survive the merge
    assert.ok(campaign.allowedChannelIds.has("42776357"));
});
test("campaigns already in inventory are not overwritten by details merge", () => {
    const now = Date.now();
    const start = new Date(now - 3600_000).toISOString();
    const end = new Date(now + 3600_000).toISOString();
    const inventory = {
        data: {
            currentUser: {
                inventory: {
                    gameEventDrops: [],
                    dropCampaignsInProgress: [
                        {
                            id: "c1",
                            name: "In Progress",
                            status: "ACTIVE",
                            game: { displayName: "Hearthstone", id: "138585" },
                            self: { isAccountConnected: true },
                            startAt: start,
                            endAt: end,
                            timeBasedDrops: [
                                {
                                    id: "realDrop",
                                    name: "Real",
                                    startAt: start,
                                    endAt: end,
                                    requiredMinutesWatched: 60,
                                    preconditionDrops: [],
                                    benefitEdges: [
                                        { benefit: { id: "b1", name: "Pack", distributionType: "DIRECT_ENTITLEMENT" } }
                                    ],
                                    self: { currentMinutesWatched: 45, isClaimed: false, dropInstanceID: "i1" }
                                }
                            ]
                        }
                    ]
                }
            }
        }
    };
    const res = campaignsResponse([
        { id: "c1", status: "ACTIVE", game: { displayName: "Hearthstone" }, startAt: start, endAt: end }
    ]);
    const details = { c1: { id: "c1", timeBasedDrops: [] } };
    const built = buildInventoryFromGqlResponses(inventory, res, {
        enableBadgesEmotes: false,
        campaignDetails: details
    });
    assert.equal(built.campaigns.length, 1);
    // Inventory progress wins — the details merge must not clobber it with an empty list
    assert.equal(built.campaigns[0].drops.length, 1);
    assert.equal(built.campaigns[0].drops[0].id, "realDrop");
});
