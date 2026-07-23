import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { TwitchPubSub, buildChannelTopics } from "../../integrations/twitchPubSub.js";
import { MAX_CHANNELS, MAX_WEBSOCKETS, WS_TOPICS_LIMIT } from "../../core/constants.js";

/** Minimal socket stub matching how TwitchPubSub uses `ws`. */
class FakeSocket extends EventEmitter {
  static OPEN = WebSocket.OPEN;
  readyState: number = WebSocket.CONNECTING;
  sent: string[] = [];

  send(data: string): void {
    this.sent.push(data);
  }

  openNow(): void {
    this.readyState = WebSocket.OPEN as number;
    this.emit("open");
  }

  close(): void {
    this.readyState = WebSocket.CLOSED as number;
    this.emit("close");
  }

  terminate(): void {
    this.close();
  }
}

test("TwitchPubSub listen sends LISTEN after open", async () => {
  let sock!: FakeSocket;
  const pubsub = new TwitchPubSub({
    createWebSocket: () => {
      sock = new FakeSocket();
      queueMicrotask(() => sock.openNow());
      return sock as unknown as WebSocket;
    }
  });
  await pubsub.start();
  pubsub.listen(["user-drop-events.99"], "tok");
  const listenMsg = sock.sent.find((s: string) => s.includes('"LISTEN"'));
  assert.ok(listenMsg);
  assert.ok(listenMsg.includes("user-drop-events.99"));
  assert.ok(listenMsg.includes("tok"));
  await pubsub.stop();
});

test("TwitchPubSub reconnect resubscribes topics", async () => {
  const sockets: FakeSocket[] = [];
  const pubsub = new TwitchPubSub({
    createWebSocket: () => {
      const s = new FakeSocket();
      sockets.push(s);
      queueMicrotask(() => s.openNow());
      return s as unknown as WebSocket;
    }
  });
  await pubsub.start();
  pubsub.listen(["topic.one"], "token1");
  const first = sockets[0];
  assert.ok(first.sent.some((x) => x.includes("topic.one")));
  first.close();
  await new Promise((r) => setTimeout(r, 2500));
  assert.ok(sockets.length >= 2, "expected second socket after reconnect");
  const second = sockets[sockets.length - 1];
  assert.ok(second.sent.some((x) => x.includes("topic.one")));
  await pubsub.stop();
});

test("PubSub pool shards 60 topics into 2 sockets (50+10)", async () => {
  const sockets: FakeSocket[] = [];
  const pubsub = new TwitchPubSub({
    createWebSocket: () => {
      const s = new FakeSocket();
      sockets.push(s);
      queueMicrotask(() => s.openNow());
      return s as unknown as WebSocket;
    }
  });
  await pubsub.start();
  const topics = Array.from({ length: 60 }, (_, i) => `video-playback-by-id.${i}`);
  pubsub.listen(topics, "tok");
  // allow async socket creation
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(sockets.length >= 2, `expected >=2 sockets for 60 topics, got ${sockets.length}`);
  const totalSubscribed = pubsub.getSubscribedTopics().length;
  assert.equal(totalSubscribed, 60);
  assert.ok(pubsub.getSocketCount() >= 2);
  await pubsub.stop();
});

test("MAX_CHANNELS 199 matches DEVILXD formula and pool capacity 400 topics", () => {
  assert.equal(MAX_CHANNELS, 199);
  assert.equal(MAX_WEBSOCKETS * WS_TOPICS_LIMIT, 400);
  // 199 channels * 2 topics per channel (video-playback + broadcast-settings) = 398 + 2 base = 400 exactly
  assert.ok(MAX_CHANNELS * 2 + 2 <= MAX_WEBSOCKETS * WS_TOPICS_LIMIT);
});

test("buildChannelTopics builds 1 per channel, or 2 with broadcast-settings", () => {
  const chans = [{ id: "1" }, { id: "2" }];
  const one = buildChannelTopics(chans);
  assert.equal(one.length, 2);
  assert.ok(one.includes("video-playback-by-id.1"));
  const two = buildChannelTopics(chans, { includeBroadcastSettings: true });
  assert.equal(two.length, 4);
  assert.ok(two.includes("broadcast-settings-update.1"));
});
