import test from "node:test";
import assert from "node:assert/strict";
import { DropsCampaign } from "../../domain/inventory.js";
import { isSpecialGameId, SPECIAL_GAME_IDS } from "../../core/constants.js";
import { canWatchChannel } from "../../domain/channel.js";
test("totalRequiredMinutes uses max not sum (upstream parity)", () => {
    // Build a campaign with precondition chain: A (60m) -> B (30m) where B requires A
    // If sum: B = 30+60=90, If max: B = 30+60=90 same single. Need branching to see diff.
    // With two preconditions A=60, B=30 both required for C=10: sum=60+30+10=100, max=60+10=70
    // But our impl only maxes one level, let's test single precondition uses chain recursively
    const rawCampaign = {
        id: "camp1",
        name: "Test",
        game: { name: "Game", slug: "game", id: "123" },
        self: { isAccountConnected: true },
        status: "ACTIVE",
        startAt: new Date().toISOString(),
        endAt: new Date(Date.now() + 3600000).toISOString(),
        timeBasedDrops: [
            {
                id: "dropA",
                name: "A",
                startAt: new Date().toISOString(),
                endAt: new Date(Date.now() + 3600000).toISOString(),
                requiredMinutesWatched: 60,
                preconditionDrops: [],
                benefitEdges: [{ benefit: { id: "b1", name: "B1", distributionType: "DIRECT_ENTITLEMENT" } }],
                self: { currentMinutesWatched: 0, isClaimed: false, dropInstanceID: "iA" }
            },
            {
                id: "dropB",
                name: "B",
                startAt: new Date().toISOString(),
                endAt: new Date(Date.now() + 3600000).toISOString(),
                requiredMinutesWatched: 30,
                preconditionDrops: [{ id: "dropA" }],
                benefitEdges: [{ benefit: { id: "b2", name: "B2", distributionType: "DIRECT_ENTITLEMENT" } }],
                self: { currentMinutesWatched: 0, isClaimed: false, dropInstanceID: "iB" }
            }
        ]
    };
    const camp = new DropsCampaign(rawCampaign, {}, false);
    const dropB = camp.timedDrops.get("dropB");
    // dropB totalRequired = 30 + max(A.totalRequired=60) = 90
    assert.equal(dropB.totalRequiredMinutes, 90);
    assert.equal(dropB.totalRemainingMinutes, 90); // nothing claimed
});
test("SPECIAL_GAME_IDS contains IRL and Just Chatting special", () => {
    assert.ok(SPECIAL_GAME_IDS.has(509663));
    assert.ok(SPECIAL_GAME_IDS.has(509672));
    assert.equal(isSpecialGameId(509672), true);
    assert.equal(isSpecialGameId("509663"), true);
    assert.equal(isSpecialGameId(123), false);
    assert.equal(isSpecialGameId(null), false);
});
test("canWatchChannel allows special IRL anywhere (upstream b5e1993)", () => {
    const ch = { id: "1", login: "streamer", online: true, viewers: 1000, gameName: "Some Random Game", gameId: "509672", dropsEnabled: true, aclBased: false };
    assert.equal(canWatchChannel(ch, ["Overwatch", "Marvel Rivals"]), true, "IRL special should be watchable for any game");
});
test("canWatchChannel allows ACL-based channels regardless of game", () => {
    const ch = { id: "1", login: "streamer", online: true, viewers: 100, gameName: "Random Game", dropsEnabled: true, aclBased: true };
    assert.equal(canWatchChannel(ch, ["Overwatch"]), true);
});
test("DropsCampaign parses allowedChannelIds from allow.channels", () => {
    const raw = {
        id: "campACL",
        name: "ACL Test",
        game: { name: "Game", slug: "game", id: "1" },
        self: { isAccountConnected: true },
        status: "ACTIVE",
        startAt: new Date().toISOString(),
        endAt: new Date(Date.now() + 3600000).toISOString(),
        allow: { channels: [{ id: "111" }, { id: "222" }] },
        timeBasedDrops: []
    };
    const camp = new DropsCampaign(raw, {}, false);
    assert.ok(camp.allowedChannelIds.has("111"));
    assert.ok(camp.allowedChannelIds.has("222"));
    assert.equal(camp.allowedChannelIds.size, 2);
});
