import WebSocket from "ws";
import { PING_INTERVAL_MS, PING_TIMEOUT_MS, TWITCH_PUBSUB_URL, WS_TOPICS_LIMIT } from "../core/constants.js";
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 60_000;
function reconnectDelayMs(attempt) {
    const exp = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** Math.min(attempt, 10));
    const jitter = Math.floor(Math.random() * 0.25 * exp);
    return exp + jitter;
}
export class TwitchPubSub {
    ws = null;
    pingTimer = null;
    pongWatchTimer = null;
    reconnectTimer = null;
    handlers = new Map();
    subscribedTopics = new Set();
    authToken = null;
    stopped = false;
    reconnectAttempt = 0;
    createWs;
    constructor(options) {
        this.createWs = options?.createWebSocket ?? ((url) => new WebSocket(url));
    }
    async start() {
        if (this.stopped) {
            return;
        }
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            return;
        }
        await this.connectOnce();
    }
    async stop() {
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
        this.sendListenBatch(batch, authToken);
    }
    /** Unsubscribe from topics and send UNLISTEN. */
    unlisten(topics, authToken) {
        const toRemove = topics.filter((t) => this.subscribedTopics.has(t));
        if (toRemove.length === 0)
            return;
        for (const t of toRemove) {
            this.subscribedTopics.delete(t);
        }
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return;
        }
        this.ws.send(JSON.stringify({
            type: "UNLISTEN",
            data: { topics: toRemove, auth_token: authToken }
        }));
    }
    getSubscribedTopics() {
        return Array.from(this.subscribedTopics);
    }
    clearReconnectTimer() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }
    scheduleReconnect() {
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
    async connectOnce() {
        if (this.stopped) {
            return;
        }
        return new Promise((resolve, reject) => {
            const ws = this.createWs(TWITCH_PUBSUB_URL);
            this.ws = ws;
            let opened = false;
            const onOpen = () => {
                opened = true;
                this.reconnectAttempt = 0;
                this.resubscribeAll();
                this.startPing();
                ws.off("error", onError);
                resolve();
            };
            const onError = (err) => {
                ws.off("open", onOpen);
                reject(err);
            };
            ws.once("open", onOpen);
            ws.once("error", onError);
            ws.on("message", (data) => {
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
    resubscribeAll() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.authToken) {
            return;
        }
        const topics = Array.from(this.subscribedTopics);
        for (let i = 0; i < topics.length; i += WS_TOPICS_LIMIT) {
            const batch = topics.slice(i, i + WS_TOPICS_LIMIT);
            this.sendListenBatch(batch, this.authToken);
        }
    }
    sendListenBatch(batch, authToken) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return;
        }
        this.ws.send(JSON.stringify({
            type: "LISTEN",
            data: { topics: batch, auth_token: authToken }
        }));
    }
    startPing() {
        this.stopPing();
        this.pingTimer = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.armPongWatch();
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
    armPongWatch() {
        this.clearPongWatch();
        this.pongWatchTimer = setTimeout(() => {
            this.pongWatchTimer = null;
            const ws = this.ws;
            if (ws && ws.readyState === WebSocket.OPEN) {
                try {
                    ws.terminate();
                }
                catch {
                    // ignore
                }
            }
        }, PING_TIMEOUT_MS);
    }
    clearPongWatch() {
        if (this.pongWatchTimer) {
            clearTimeout(this.pongWatchTimer);
            this.pongWatchTimer = null;
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
            this.clearPongWatch();
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
