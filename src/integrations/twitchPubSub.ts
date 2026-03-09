import WebSocket from "ws";
import { PING_INTERVAL_MS, TWITCH_PUBSUB_URL } from "../core/constants.js";

export type TopicHandler = (message: Record<string, unknown>) => Promise<void> | void;

export class TwitchPubSub {
  private ws: WebSocket | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private handlers = new Map<string, TopicHandler>();

  async start(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(TWITCH_PUBSUB_URL);
      this.ws = ws;
      ws.on("open", () => {
        this.startPing();
        resolve();
      });
      ws.on("error", (err: Error) => reject(err));
      ws.on("message", (data: WebSocket.RawData) => this.onMessage(data.toString()));
      ws.on("close", () => this.stopPing());
    });
  }

  async stop(): Promise<void> {
    this.stopPing();
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

  listen(topics: string[], authToken: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("PubSub socket is not connected.");
    }
    const payload = {
      type: "LISTEN",
      data: {
        topics,
        auth_token: authToken
      }
    };
    this.ws.send(JSON.stringify(payload));
  }

  unlisten(topics: string[], authToken: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    const payload = {
      type: "UNLISTEN",
      data: {
        topics,
        auth_token: authToken
      }
    };
    this.ws.send(JSON.stringify(payload));
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
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

  private async onMessage(raw: string): Promise<void> {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
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

