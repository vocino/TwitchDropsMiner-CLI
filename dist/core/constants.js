export const TWITCH_OAUTH_DEVICE_URL = "https://id.twitch.tv/oauth2/device";
export const TWITCH_OAUTH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
export const TWITCH_OAUTH_VALIDATE_URL = "https://id.twitch.tv/oauth2/validate";
export const TWITCH_GQL_URL = "https://gql.twitch.tv/gql";
export const TWITCH_PUBSUB_URL = "wss://pubsub-edge.twitch.tv/v1";
export const WATCH_INTERVAL_MS = 59_000;
export const PING_INTERVAL_MS = 180_000;
export const PING_TIMEOUT_MS = 10_000;
export const MAX_WEBSOCKETS = 8;
export const WS_TOPICS_LIMIT = 50;
export const BASE_PUBSUB_TOPICS = 2;
export const TOPICS_PER_CHANNEL = 2;
export const MAX_TOPICS = MAX_WEBSOCKETS * WS_TOPICS_LIMIT - BASE_PUBSUB_TOPICS;
export const MAX_CHANNELS = Math.floor(MAX_TOPICS / TOPICS_PER_CHANNEL);
export const TWITCH_ANDROID_CLIENT_ID = "kd1unb4b3q4t58fwlpcbzcbnm76a8fp";
// Upstream DevilXD ClientType.ANDROID_APP rotates 7 device UAs via random.choice — match full list
export const TWITCH_ANDROID_USER_AGENTS = [
    "Dalvik/2.1.0 (Linux; U; Android 16; SM-S911B Build/TP1A.220624.014) tv.twitch.android.app/25.3.0/2503006",
    "Dalvik/2.1.0 (Linux; U; Android 16; SM-S938B Build/BP2A.250605.031) tv.twitch.android.app/25.3.0/2503006",
    "Dalvik/2.1.0 (Linux; Android 16; SM-X716N Build/UP1A.231005.007) tv.twitch.android.app/25.3.0/2503006",
    "Dalvik/2.1.0 (Linux; U; Android 15; SM-G990B Build/AP3A.240905.015.A2) tv.twitch.android.app/25.3.0/2503006",
    "Dalvik/2.1.0 (Linux; U; Android 15; SM-G970F Build/AP3A.241105.008) tv.twitch.android.app/25.3.0/2503006",
    "Dalvik/2.1.0 (Linux; U; Android 15; SM-A566E Build/AP3A.240905.015.A2) tv.twitch.android.app/25.3.0/2503006",
    "Dalvik/2.1.0 (Linux; U; Android 14; SM-X306B Build/UP1A.231005.007) tv.twitch.android.app/25.3.0/2503006"
];
export function getAndroidUserAgent() {
    return TWITCH_ANDROID_USER_AGENTS[Math.floor(Math.random() * TWITCH_ANDROID_USER_AGENTS.length)];
}
// Per-process pick (legacy) — new code should call getAndroidUserAgent() per request for upstream parity
export const TWITCH_ANDROID_USER_AGENT = getAndroidUserAgent();
// Special games that can be earned watching ANY game — upstream DevilXD utils.Game.SPECIAL_GAME_IDS
// Matches inventory.py {509663, 509672} (Just Chatting / IRL variants)
export const SPECIAL_GAME_IDS = new Set([509663, 509672]);
export function isSpecialGameId(id) {
    if (id == null)
        return false;
    const n = typeof id === "string" ? parseInt(id, 10) : id;
    if (!Number.isFinite(n))
        return false;
    return SPECIAL_GAME_IDS.has(n);
}
