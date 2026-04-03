import WebSocket from "ws";
import {
  PING_INTERVAL_MS,
  PING_TIMEOUT_MS,
  TWITCH_PUBSUB_URL,
  WS_TOPICS_LIMIT
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

export class TwitchPubSub {
  private ws: WebSocket | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private pongWatchTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private handlers = new Map<string, TopicHandler>();
  private subscribedTopics = new Set<string>();
  private authToken: string | null = null;
  private stopped = false;
  private reconnectAttempt = 0;
  private readonly createWs: WebSocketFactory;

  constructor(options?: { createWebSocket?: WebSocketFactory }) {
    this.createWs = options?.createWebSocket ?? ((url: string) => new WebSocket(url));
  }

  async start(): Promise<void> {
    if (this.stopped) {
      return;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }
    await this.connectOnce();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.clearReconnectTimer();
    this.stopPing();
    this.clearPongWatch();
    this.subscribedTopics.clear();
    this.authToken = null;
    const ws = this.ws;
    this.ws = null;
    if (!ws) {
      return;
    }
    await new Promise<void>((resolve) => {
      ws.once("close", () => resolve());
      ws.close();
    });
  }

  registerTopic(topic: string, handler: TopicHandler): void {
    this.handlers.set(topic, handler);
  }

  /** Subscribe to topics; batches and enforces WS_TOPICS_LIMIT. Stores token for reconnect. */
  listen(topics: string[], authToken: string): void {
    this.authToken = authToken;
    const toAdd = topics.filter((t) => !this.subscribedTopics.has(t));
    if (toAdd.length === 0) return;
    const capacity = WS_TOPICS_LIMIT - this.subscribedTopics.size;
    const batch = toAdd.slice(0, Math.max(0, capacity));
    if (batch.length === 0) return;
    for (const t of batch) {
      this.subscribedTopics.add(t);
    }
    this.sendListenBatch(batch, authToken);
  }

  /** Unsubscribe from topics and send UNLISTEN. */
  unlisten(topics: string[], authToken: string): void {
    const toRemove = topics.filter((t) => this.subscribedTopics.has(t));
    if (toRemove.length === 0) return;
    for (const t of toRemove) {
      this.subscribedTopics.delete(t);
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(
      JSON.stringify({
        type: "UNLISTEN",
        data: { topics: toRemove, auth_token: authToken }
      })
    );
  }

  getSubscribedTopics(): string[] {
    return Array.from(this.subscribedTopics);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) {
      return;
    }
    const delay = reconnectDelayMs(this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connectOnce().catch(() => {
        if (!this.stopped) {
          this.scheduleReconnect();
        }
      });
    }, delay);
  }

  private async connectOnce(): Promise<void> {
    if (this.stopped) {
      return;
    }

    return new Promise<void>((resolve, reject) => {
      const ws = this.createWs(TWITCH_PUBSUB_URL);
      this.ws = ws;
      let opened = false;

      const onOpen = (): void => {
        opened = true;
        this.reconnectAttempt = 0;
        this.resubscribeAll();
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
        if (wasCurrent) {
          this.ws = null;
        }
        if (!this.stopped && wasCurrent && opened) {
          this.scheduleReconnect();
        }
      });
    });
  }

  private resubscribeAll(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.authToken) {
      return;
    }
    const topics = Array.from(this.subscribedTopics);
    for (let i = 0; i < topics.length; i += WS_TOPICS_LIMIT) {
      const batch = topics.slice(i, i + WS_TOPICS_LIMIT);
      this.sendListenBatch(batch, this.authToken);
    }
  }

  private sendListenBatch(batch: string[], authToken: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(
      JSON.stringify({
        type: "LISTEN",
        data: { topics: batch, auth_token: authToken }
      })
    );
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
      this.pongWatchTimer = null;
      const ws = this.ws;
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.terminate();
        } catch {
          // ignore
        }
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

    if (parsed.type === "MESSAGE" && typeof parsed.data === "object" && parsed.data) {
      const data = parsed.data as { topic?: string; message?: string };
      const topic = data.topic;
      const msg = data.message;
      if (!topic || !msg) {
        return;
      }
      const handler = this.handlers.get(topic);
      if (!handler) {
        return;
      }
      try {
        await handler(JSON.parse(msg) as Record<string, unknown>);
      } catch {
        // swallow callback errors to keep listener alive
      }
    }
  }
}
