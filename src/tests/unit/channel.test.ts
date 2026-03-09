import test from "node:test";
import assert from "node:assert/strict";
import { canWatchChannel, sortChannelCandidates } from "../../domain/channel.js";

test("canWatchChannel requires online, drops enabled, and wanted game", () => {
  const ok = canWatchChannel(
    {
      id: "1",
      login: "alpha",
      online: true,
      viewers: 100,
      gameName: "GameA",
      dropsEnabled: true
    },
    ["GameA"]
  );
  assert.equal(ok, true);
});

test("sortChannelCandidates prioritizes wanted game then viewers", () => {
  const sorted = sortChannelCandidates(
    [
      { id: "1", login: "a", online: true, viewers: 50, gameName: "GameB", dropsEnabled: true },
      { id: "2", login: "b", online: true, viewers: 10, gameName: "GameA", dropsEnabled: true }
    ],
    ["GameA", "GameB"]
  );
  assert.equal(sorted[0]?.id, "2");
});

