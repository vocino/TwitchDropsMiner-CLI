import test from "node:test";
import assert from "node:assert/strict";
import { buildSpadePayload } from "../../integrations/twitchSpade.js";

const SPADE_PATTERN = /"(?:beacon|spade)_?url":\s*"(https:\/\/[.\w\-/]+\.ts(?:\?allow_stream=true)?)"/i;

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
  assert.equal(payload[0]?.properties?.player, "site");
});

test("spade URL regex extracts URL from synthetic HTML", () => {
  const html = '"beacon_url": "https://spade.example.com/v1/beacon.ts?allow_stream=true"';
  const match = html.match(SPADE_PATTERN);
  assert.ok(match);
  assert.equal(match[1], "https://spade.example.com/v1/beacon.ts?allow_stream=true");
});
