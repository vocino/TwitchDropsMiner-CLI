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

test("requestState preserves a pending inventory fetch over channel churn", () => {
  const sm = new StateMachine();
  sm.setState("INVENTORY_FETCH");
  sm.requestState("CHANNELS_CLEANUP");
  assert.equal(sm.state, "INVENTORY_FETCH");
});

test("requestState preserves a pending claim cycle over channel churn", () => {
  const sm = new StateMachine();
  sm.setState("GAMES_UPDATE");
  sm.requestState("CHANNELS_CLEANUP");
  assert.equal(sm.state, "GAMES_UPDATE");
});

test("requestState still accepts inventory fetch requests anytime", () => {
  const sm = new StateMachine();
  sm.setState("CHANNELS_CLEANUP");
  sm.requestState("INVENTORY_FETCH");
  assert.equal(sm.state, "INVENTORY_FETCH");
});

test("requestState passes routine channel churn through otherwise", () => {
  const sm = new StateMachine();
  sm.setState("IDLE");
  sm.requestState("CHANNELS_CLEANUP");
  assert.equal(sm.state, "CHANNELS_CLEANUP");
});

