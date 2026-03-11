import test from "node:test";
import assert from "node:assert/strict";
import { canWatchChannel, sortChannelCandidates, getChannelPriority, shouldSwitchChannel } from "../../domain/channel.js";
test("canWatchChannel requires online, drops enabled, and wanted game", () => {
    const ok = canWatchChannel({
        id: "1",
        login: "alpha",
        online: true,
        viewers: 100,
        gameName: "GameA",
        dropsEnabled: true
    }, ["GameA"]);
    assert.equal(ok, true);
});
test("sortChannelCandidates prioritizes wanted game then viewers", () => {
    const sorted = sortChannelCandidates([
        { id: "1", login: "a", online: true, viewers: 50, gameName: "GameB", dropsEnabled: true },
        { id: "2", login: "b", online: true, viewers: 10, gameName: "GameA", dropsEnabled: true }
    ], ["GameA", "GameB"]);
    assert.equal(sorted[0]?.id, "2");
});
test("getChannelPriority prefers ACL then game order then viewers", () => {
    const wanted = ["GameA", "GameB"];
    const acl = {
        id: "acl",
        login: "acl_ch",
        online: true,
        viewers: 5,
        gameName: "GameB",
        dropsEnabled: true,
        aclBased: true
    };
    const nonAcl = {
        id: "dir",
        login: "dir_ch",
        online: true,
        viewers: 1000,
        gameName: "GameA",
        dropsEnabled: true,
        aclBased: false
    };
    assert.ok(getChannelPriority(acl, wanted) < getChannelPriority(nonAcl, wanted));
    const sorted = sortChannelCandidates([nonAcl, acl], wanted);
    assert.equal(sorted[0]?.id, "acl");
});
test("shouldSwitchChannel returns true when current is null or candidate has higher priority", () => {
    const wanted = ["GameA", "GameB"];
    const low = {
        id: "1",
        login: "low",
        online: true,
        viewers: 10,
        gameName: "GameB",
        dropsEnabled: true
    };
    const high = {
        id: "2",
        login: "high",
        online: true,
        viewers: 100,
        gameName: "GameA",
        dropsEnabled: true
    };
    assert.equal(shouldSwitchChannel(null, high, wanted), true);
    assert.equal(shouldSwitchChannel(low, high, wanted), true);
    assert.equal(shouldSwitchChannel(high, low, wanted), false);
});
test("channels without wanted game or dropsEnabled are filtered by canWatchChannel", () => {
    const wanted = ["GameA"];
    assert.equal(canWatchChannel({ id: "1", login: "x", online: true, viewers: 1, gameName: "Other", dropsEnabled: true }, wanted), false);
    assert.equal(canWatchChannel({ id: "2", login: "y", online: true, viewers: 1, gameName: "GameA", dropsEnabled: false }, wanted), false);
    assert.equal(canWatchChannel({ id: "3", login: "z", online: true, viewers: 1, gameName: "GameA", dropsEnabled: true }, wanted), true);
});
