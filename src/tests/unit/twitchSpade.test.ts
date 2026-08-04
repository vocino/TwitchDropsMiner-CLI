import test from "node:test";
import assert from "node:assert/strict";
import { buildSpadePayload, buildSpadeGqlPayload } from "../../integrations/twitchSpade.js";

const SPADE_PATTERN = /"(?:beacon|spade)_?url":\s*"(https:\/\/[.\\w\-/]+\.ts(?:\?allow_stream=true)?)"/i;

test("buildSpadePayload returns base64 data with minute-watched event", () => {
  const out = buildSpadePayload("12345", "67890", "streamer", "user1");
  assert.ok(out.data);
  const decoded = Buffer.from(out.data, "base64").toString("utf8");
  const payload = JSON.parse(decoded);
  assert.equal(Array.isArray(payload), true);
  assert.equal(payload[0]?.event, "minute-watched");
  assert.equal(payload[0]?.properties?.broadcast_id, "12345");
  assert.equal(payload[0]?.properties?.channel_id, "67890");
  assert.equal(payload[0]?.properties?.channel, "streamer");
  assert.equal(payload[0]?.properties?.user_id, "user1");
  assert.equal(payload[0]?.properties?.live, true);
  // upstream 2026-07-11 reverted to Spade: no location/player — ensure minimal payload
  assert.equal(payload[0]?.properties?.location, undefined);
  assert.equal(payload[0]?.properties?.player, undefined);
});

test("buildSpadePayload includes upstream parity fields game, game_id, client_time, is_live, minutes_logged", () => {
  const out = buildSpadePayload("123", "456", "chan", "u1", { gameName: "WoW", gameId: "12345" });
  const decoded = Buffer.from(out.data, "base64").toString("utf8");
  const payload = JSON.parse(decoded);
  const props = payload[0]?.properties;
  assert.equal(props?.game, "WoW");
  assert.equal(props?.game_id, "12345");
  assert.equal(props?.is_live, true);
  assert.equal(props?.minutes_logged, 1);
  assert.ok(typeof props?.client_time === "string" && props.client_time.length > 0);
  // ISO parseable
  assert.ok(!isNaN(new Date(props.client_time).getTime()));
});

test("buildSpadeGqlPayload produces gzip b64 for mutation fallback", () => {
  const out = buildSpadeGqlPayload("b123", "c456", "chan", "u1", { gameName: "Game", gameId: "1" });
  assert.ok(out.encodedData.length > 0);
  assert.ok(out.query.includes("SendEvents"));
});

test("spade URL regex extracts URL from synthetic HTML", () => {
  const SPADE_PATTERN = /"(?:beacon|spade)_?url":\s*"(https:\/\/[.\w\-/]+\.ts(?:\?allow_stream=true)?)"/i;
  const html = '"beacon_url": "https://spade.example.com/v1/beacon.ts?allow_stream=true"';
  const match = html.match(SPADE_PATTERN);
  assert.ok(match);
  assert.equal(match[1], "https://spade.example.com/v1/beacon.ts?allow_stream=true");
});
