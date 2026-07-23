import WebSocket from "ws";
import {
  PING_INTERVAL_MS,
  PING_TIMEOUT_MS,
  TWITCH_PUBSUB_URL,
  WS_TOPICS_LIMIT,
  MAX_WEBSOCKETS,
  MAX_CHANNELS
} from "../core/constants.js";

export type TopicHandler = (message: Record<string, unknown>) => Promise<void> | void;
export type WebSocketFactory = (url: string) => WebSocket;

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 60_000;

function reconnectDelayMs(attempt: number): number {
  const exp = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** Math.min(attempt, 10));
  const jitter = Math.floor(Math.random() * 0.25 * exp);
  return exp + jitter;
}

// Single socket — unchanged logic extracted
class SingleSocket {
  private ws: WebSocket | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private pongWatchTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private handlers: Map<string, TopicHandler>;
  private subscribedTopics = new Set<string>();
  private authToken: string | null = null;
  private stopped = false;
  private reconnectAttempt = 0;
  private readonly createWs: WebSocketFactory;
  private readonly idx: number;

  constructor(
    idx: number,
    handlers: Map<string, TopicHandler>,
    createWs: WebSocketFactory
  ) {
    this.idx = idx;
    this.handlers = handlers;
    this.createWs = createWs;
  }

  get topics(): Set<string> {
    return this.subscribedTopics;
  }

  isStopped(): boolean {
    return this.stopped;
  }

  async start(): Promise<void> {
    this.stopped = false;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    await this.connectOnce();
  }

  async stop(remove = false): Promise<void> {
    this.stopped = true;
    this.clearReconnectTimer();
    this.stopPing();
    this.clearPongWatch();
    if (remove) this.subscribedTopics.clear();
    this.authToken = null;
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    await new Promise<void>((resolve) => {
      ws.once("close", () => resolve());
      ws.close();
    });
  }

  addTopics(batch: string[], token: string): string[] {
    this.authToken = token;
    const toAdd = batch.filter((t) => !this.subscribedTopics.has(t));
    const cap = WS_TOPICS_LIMIT - this.subscribedTopics.size;
    const sliced = toAdd.slice(0, Math.max(0, cap));
    for (const t of sliced) this.subscribedTopics.add(t);
    if (sliced.length > 0) this.sendListenBatch(sliced, token);
    return batch.slice(sliced.length); // leftover
  }

  removeTopics(topics: Set<string>): void {
    const existing = Array.from(topics).filter((t) => this.subscribedTopics.has(t));
    if (existing.length === 0) return;
    for (const t of existing) {
      this.subscribedTopics.delete(t);
      topics.delete(t);
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.authToken) {
      this.ws.send(JSON.stringify({ type: "UNLISTEN", data: { topics: existing, auth_token: this.authToken } }));
    }
  }

  resubscribe(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.authToken) return;
    const topics = Array.from(this.subscribedTopics);
    for (let i = 0; i < topics.length; i += WS_TOPICS_LIMIT) {
      this.sendListenBatch(topics.slice(i, i + WS_TOPICS_LIMIT), this.authToken!);
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    const delay = reconnectDelayMs(this.reconnectAttempt++);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connectOnce().catch(() => {
        if (!this.stopped) this.scheduleReconnect();
      });
    }, delay);
  }

  private async connectOnce(): Promise<void> {
    if (this.stopped) return;
    return new Promise<void>((resolve, reject) => {
      const ws = this.createWs(TWITCH_PUBSUB_URL);
      this.ws = ws;
      let opened = false;
      const onOpen = (): void => {
        opened = true;
        this.reconnectAttempt = 0;
        this.resubscribe();
        this.startPing();
        ws.off("error", onError);
        resolve();
      };
      const onError = (err: Error): void => {
        ws.off("open", onOpen);
        reject(err);
      };
      ws.once("open", onOpen);
      ws.once("error", onError);
      ws.on("message", (data: WebSocket.RawData) => {
        void this.onMessage(data.toString());
      });
      ws.on("close", () => {
        this.stopPing();
        this.clearPongWatch();
        const wasCurrent = this.ws === ws;
        if (wasCurrent) this.ws = null;
        if (!this.stopped && wasCurrent && opened) this.scheduleReconnect();
      });
    });
  }

  private sendListenBatch(batch: string[], token: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.authToken = token;
    this.ws.send(JSON.stringify({ type: "LISTEN", data: { topics: batch, auth_token: token } }));
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.armPongWatch();
        this.ws.send(JSON.stringify({ type: "PING" }));
      }
    }, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private armPongWatch(): void {
    this.clearPongWatch();
    this.pongWatchTimer = setTimeout(() => {
      const ws = this.ws;
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.terminate();
        } catch {}
      }
    }, PING_TIMEOUT_MS);
  }

  private clearPongWatch(): void {
    if (this.pongWatchTimer) {
      clearTimeout(this.pongWatchTimer);
      this.pongWatchTimer = null;
    }
  }

  private async onMessage(raw: string): Promise<void> {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    if (parsed.type === "PONG") {
      this.clearPongWatch();
      return;
    }
    if (parsed.type === "RECONNECT") {
      this.scheduleReconnect();
      try {
        this.ws?.terminate();
      } catch {}
      return;
    }
    if (parsed.type === "MESSAGE" && typeof parsed.data === "object" && parsed.data) {
      const data = parsed.data as { topic?: string; message?: string };
      const topic = data.topic;
      const msg = data.message;
      if (!topic || !msg) return;
      const handler = this.handlers.get(topic);
      if (!handler) return;
      try {
        await handler(JSON.parse(msg) as Record<string, unknown>);
      } catch {}
    }
  }
}

/**
 * Pool of up to MAX_WEBSOCKETS sockets, sharded WS_TOPICS_LIMIT per socket.
 * API mirrors old TwitchPubSub for backward compat but internally shards.
 * Topics: up to MAX_WEBSOCKETS * WS_TOPICS_LIMIT = 400.
 * With 2 topics per channel (video-playback + broadcast-settings) -> 199 channels (matching DevilXD).
 *
 * Supports broadcast-settings-update topic for early offline detection.
 */
export class TwitchPubSub {
  private sockets: SingleSocket[] = [];
  private handlers = new Map<string, TopicHandler>();
  private readonly createWs: WebSocketFactory;
  private authToken: string | null = null;
  private stopped = false;

  constructor(options?: { createWebSocket?: WebSocketFactory }) {
    this.createWs = options?.createWebSocket ?? ((url: string) => new WebSocket(url));
  }

  async start(): Promise<void> {
    this.stopped = false;
    if (this.sockets.length === 0) {
      this.sockets.push(new SingleSocket(0, this.handlers, this.createWs));
    }
    await Promise.all(this.sockets.map((s) => s.start()));
  }

  async stop(): Promise<void> {
    this.stopped = true;
    const toStop = this.sockets.splice(0);
    await Promise.all(toStop.map((s) => s.stop(true)));
    this.authToken = null;
  }

  registerTopic(topic: string, handler: TopicHandler): void {
    this.handlers.set(topic, handler);
  }

  /** Total subscribed topics across all sockets */
  getSubscribedTopics(): string[] {
    const all: string[] = [];
    for (const s of this.sockets) all.push(...s.topics);
    return all;
  }

  /** Number of underlying websocket connections (useful for status/debug) */
  getSocketCount(): number {
    return this.sockets.length;
  }

  /** Subscribe — shards across sockets up to MAX_WEBSOCKETS, each WS_TOPICS_LIMIT */
  listen(topics: string[], authToken: string): void {
    if (topics.length === 0) return;
    this.authToken = authToken;

    // Deduplicate already subscribed
    const existing = new Set(this.getSubscribedTopics());
    let toAdd = topics.filter((t) => !existing.has(t));
    if (toAdd.length === 0) return;

    // Try to fill existing sockets
    for (const sock of this.sockets) {
      if (toAdd.length === 0) break;
      toAdd = sock.addTopics(toAdd, authToken);
    }

    // Need new sockets?
    while (toAdd.length > 0) {
      if (this.sockets.length >= MAX_WEBSOCKETS) {
        // Cap reached — log via console.warn, skip excess (matches upstream MinerException)
        console.warn(
          `[PubSubPool] Maximum topics limit reached (${MAX_WEBSOCKETS * WS_TOPICS_LIMIT}), dropping ${toAdd.length} topics`
        );
        break;
      }
      const sock = new SingleSocket(this.sockets.length, this.handlers, this.createWs);
      this.sockets.push(sock);
      if (!this.stopped) {
        void sock.start().then(() => {
          // After connect, resubscribe already handled via addTopics -> sendListenBatch deferred? Actually addTopics tries to send immediately, but socket not yet open — resubscribe on open will send.
          // So we also call resubscribe hook via later attempt, but to ensure pending topics sent, we re-add leftover via this socket's resubscribe will include them if we already added to subscribedTopics.
        });
      }
      toAdd = sock.addTopics(toAdd, authToken);
    }
  }

  unlisten(topics: string[], authToken: string): void {
    const set = new Set(topics);
    if (set.size === 0) return;
    for (const sock of this.sockets) {
      sock.removeTopics(set);
      if (set.size === 0) break;
    }
    // Optionally shrink pool if we have many under-filled sockets (recycle like upstream)
    this.maybeShrink();
    void authToken; // keep signature compatible
  }

  private maybeShrink(): void {
    // If total topics fit in (n-1)*LIMIT, drop last socket(s)
    while (this.sockets.length > 1) {
      const total = this.sockets.reduce((acc, s) => acc + s.topics.size, 0);
      const capacityWithoutLast = (this.sockets.length - 1) * WS_TOPICS_LIMIT;
      if (total <= capacityWithoutLast) {
        const last = this.sockets.pop()!;
        void last.stop(true);
        // Recycle topics from removed socket (should be 0 after condition, but just in case)
        const leftover = Array.from(last.topics);
        if (leftover.length > 0 && this.authToken) {
          this.listen(leftover, this.authToken);
        }
      } else {
        break;
      }
    }
  }
}

/** Backwards compat alias — old code instantiated TwitchPubSub directly */
export const TwitchPubSubPool = TwitchPubSub;

/** Helper to build channel topics — 2 per channel parity with upstream if requested */
export function buildChannelTopics(
  channels: { id: string }[],
  opts?: { includeBroadcastSettings?: boolean }
): string[] {
  const topics: string[] = [];
  for (const ch of channels) {
    topics.push(`video-playback-by-id.${ch.id}`);
    if (opts?.includeBroadcastSettings) {
      topics.push(`broadcast-settings-update.${ch.id}`);
    }
  }
  return topics;
}

export function getMaxChannels(): number {
  return MAX_CHANNELS; // 199
}
