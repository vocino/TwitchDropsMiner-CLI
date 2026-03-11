import WebSocket from "ws";
import { PING_INTERVAL_MS, TWITCH_PUBSUB_URL, WS_TOPICS_LIMIT } from "../core/constants.js";
export class TwitchPubSub {
    ws = null;
    pingTimer = null;
    handlers = new Map();
    subscribedTopics = new Set();
    authToken = null;
    async start() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            return;
        }
        await new Promise((resolve, reject) => {
            const ws = new WebSocket(TWITCH_PUBSUB_URL);
            this.ws = ws;
            ws.on("open", () => {
                this.startPing();
                resolve();
            });
            ws.on("error", (err) => reject(err));
            ws.on("message", (data) => this.onMessage(data.toString()));
            ws.on("close", () => this.stopPing());
        });
    }
    async stop() {
        this.stopPing();
        this.subscribedTopics.clear();
        this.authToken = null;
        const ws = this.ws;
        this.ws = null;
        if (!ws) {
            return;
        }
        await new Promise((resolve) => {
            ws.once("close", () => resolve());
            ws.close();
        });
    }
    registerTopic(topic, handler) {
        this.handlers.set(topic, handler);
    }
    /** Subscribe to topics; batches and enforces WS_TOPICS_LIMIT. Stores token for reconnect. */
    listen(topics, authToken) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error("PubSub socket is not connected.");
        }
        this.authToken = authToken;
        const toAdd = topics.filter((t) => !this.subscribedTopics.has(t));
        if (toAdd.length === 0)
            return;
        const capacity = WS_TOPICS_LIMIT - this.subscribedTopics.size;
        const batch = toAdd.slice(0, Math.max(0, capacity));
        if (batch.length === 0)
            return;
        for (const t of batch) {
            this.subscribedTopics.add(t);
        }
        this.ws.send(JSON.stringify({
            type: "LISTEN",
            data: { topics: batch, auth_token: authToken }
        }));
    }
    /** Unsubscribe from topics and send UNLISTEN. */
    unlisten(topics, authToken) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return;
        }
        const toRemove = topics.filter((t) => this.subscribedTopics.has(t));
        if (toRemove.length === 0)
            return;
        for (const t of toRemove) {
            this.subscribedTopics.delete(t);
        }
        this.ws.send(JSON.stringify({
            type: "UNLISTEN",
            data: { topics: toRemove, auth_token: authToken }
        }));
    }
    getSubscribedTopics() {
        return Array.from(this.subscribedTopics);
    }
    startPing() {
        this.stopPing();
        this.pingTimer = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: "PING" }));
            }
        }, PING_INTERVAL_MS);
    }
    stopPing() {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
    }
    async onMessage(raw) {
        let parsed;
        try {
            parsed = JSON.parse(raw);
        }
        catch {
            return;
        }
        if (parsed.type === "PONG") {
            return;
        }
        if (parsed.type === "MESSAGE" && typeof parsed.data === "object" && parsed.data) {
            const data = parsed.data;
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
                await handler(JSON.parse(msg));
            }
            catch {
                // swallow callback errors to keep listener alive
            }
        }
    }
}
