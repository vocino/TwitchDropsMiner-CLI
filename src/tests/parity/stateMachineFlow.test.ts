import test from "node:test";
import assert from "node:assert/strict";
import { StateMachine } from "../../core/stateMachine.js";

test("state machine supports expected flow states", () => {
  const sm = new StateMachine();
  sm.setState("INVENTORY_FETCH");
  assert.equal(sm.state, "INVENTORY_FETCH");
  sm.setState("GAMES_UPDATE");
  assert.equal(sm.state, "GAMES_UPDATE");
  sm.setState("CHANNELS_FETCH");
  assert.equal(sm.state, "CHANNELS_FETCH");
  sm.setState("CHANNEL_SWITCH");
  assert.equal(sm.state, "CHANNEL_SWITCH");
});

