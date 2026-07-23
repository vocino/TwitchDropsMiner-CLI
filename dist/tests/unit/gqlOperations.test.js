import test from "node:test";
import assert from "node:assert/strict";
import { GQL_OPERATIONS, gqlPayload } from "../../integrations/gqlOperations.js";
test("GameDirectory synced to upstream hash + full variables", () => {
    const op = GQL_OPERATIONS.GameDirectory;
    assert.equal(op.operationName, "DirectoryPage_Game");
    assert.equal(op.sha256Hash, "86bcceb4e8b1a51256ff8eed8bd8aae4acacf80d737efe904f84f3aeadf8cafd");
    assert.equal(op.variables.limit, 30);
    assert.ok("slug" in op.variables);
    assert.equal(op.variables.imageWidth, 50);
    assert.equal(op.variables.includeCostreaming, false);
    assert.ok("options" in op.variables);
    const opts = op.variables.options;
    assert.deepEqual(opts.includeRestricted, ["SUB_ONLY_LIVE"]);
    assert.equal(opts.sort, "RELEVANCE");
    assert.equal(opts.requestID, "JIRA-VXP-2397");
    assert.equal(op.variables.sortTypeIsRecency, false);
});
test("SlugRedirect operation present", () => {
    const op = GQL_OPERATIONS.SlugRedirect;
    assert.ok(op);
    assert.equal(op.operationName, "DirectoryGameRedirect");
    assert.equal(op.sha256Hash, "1f0300090caceec51f33c5e20647aceff9017f740f223c3c532ba6fa59f6b6cc");
    assert.ok("name" in op.variables);
});
test("PlaybackAccessToken operation shape", () => {
    const op = GQL_OPERATIONS.PlaybackAccessToken;
    assert.equal(op.operationName, "PlaybackAccessToken");
    assert.equal(op.sha256Hash, "ed230aa1e33e07eebb8928504583da78a5173989fadfb1ac94be06a04f3cdbe9");
    const v = op.variables;
    assert.equal(v.isLive, true);
    assert.equal(v.isVod, false);
    assert.equal(v.platform, "web");
    assert.equal(v.playerType, "site");
    assert.equal(v.vodID, "");
});
test("GetStreamInfo operation shape", () => {
    const op = GQL_OPERATIONS.GetStreamInfo;
    assert.equal(op.operationName, "VideoPlayerStreamInfoOverlayChannel");
    assert.equal(op.sha256Hash, "198492e0857f6aedead9665c81c5a06d67b25b58034649687124083ff288597d");
    assert.ok("channel" in op.variables);
});
test("CampaignDetails operation shape", () => {
    const op = GQL_OPERATIONS.CampaignDetails;
    assert.equal(op.operationName, "DropCampaignDetails");
    assert.equal(op.sha256Hash, "039277bf98f3130929262cc7c6efd9c141ca3749cb6dca442fc8ead9a53f77c1");
    const v = op.variables;
    assert.ok("channelLogin" in v);
    assert.ok("dropID" in v);
});
test("AvailableDrops operation shape", () => {
    const op = GQL_OPERATIONS.AvailableDrops;
    assert.equal(op.operationName, "DropsHighlightService_AvailableDrops");
    assert.equal(op.sha256Hash, "782dad0f032942260171d2d80a654f88bdd0c5a9dddc392e9bc92218a0f42d20");
    assert.ok("channelID" in op.variables);
});
test("ChannelPointsContext present (future use)", () => {
    const op = GQL_OPERATIONS.ChannelPointsContext;
    assert.ok(op);
    assert.equal(op.operationName, "ChannelPointsContext");
    assert.equal(op.sha256Hash, "374314de591e69925fce3ddc2bcf085796f56ebb8cad67a0daa3165c03adc345");
});
test("Inventory and Campaigns retain fetchRewardCampaigns:false", () => {
    assert.deepEqual(GQL_OPERATIONS.Inventory.variables.fetchRewardCampaigns, false);
    assert.deepEqual(GQL_OPERATIONS.Campaigns.variables.fetchRewardCampaigns, false);
});
test("gqlPayload merges variable overrides for GameDirectory", () => {
    const payload = gqlPayload(GQL_OPERATIONS.GameDirectory, { slug: "just-chatting" });
    assert.equal(payload.operationName, "DirectoryPage_Game");
    assert.equal(payload.variables.slug, "just-chatting");
    assert.equal(payload.variables.limit, 30);
    assert.equal(payload.extensions.persistedQuery.sha256Hash, GQL_OPERATIONS.GameDirectory.sha256Hash);
});
test("gqlPayload for SlugRedirect name resolution", () => {
    const payload = gqlPayload(GQL_OPERATIONS.SlugRedirect, { name: "Just Chatting" });
    assert.equal(payload.operationName, "DirectoryGameRedirect");
    assert.equal(payload.variables.name, "Just Chatting");
});
