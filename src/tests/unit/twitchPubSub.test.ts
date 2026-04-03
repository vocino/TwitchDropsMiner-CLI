import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { TwitchPubSub } from "../../integrations/twitchPubSub.js";

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
