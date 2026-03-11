import { request } from "undici";
import { TWITCH_ANDROID_CLIENT_ID, TWITCH_ANDROID_USER_AGENT } from "../core/constants.js";
const SPADE_PATTERN = /"(?:beacon|spade)_?url":\s*"(https:\/\/[.\w\-/]+\.ts(?:\?allow_stream=true)?)"/i;
const SETTINGS_PATTERN = /src="(https:\/\/[\w.]+\/config\/settings\.[0-9a-f]{32}\.js)"/i;
const DEFAULT_SPADE_BASE = "https://spade.twitch.tv";
const CHANNEL_PAGE_BASE = "https://www.twitch.tv";
/**
 * Build minute-watched payload and return { data: base64(json) } as sent by Twitch web.
 */
export function buildSpadePayload(broadcastId, channelId, channelLogin, userId) {
    const payload = [
        {
            event: "minute-watched",
            properties: {
                broadcast_id: broadcastId,
                channel_id: channelId,
                channel: channelLogin,
                hidden: false,
                live: true,
                location: "channel",
                logged_in: true,
                muted: false,
                player: "site",
                user_id: userId
            }
        }
    ];
    const json = JSON.stringify(payload);
    const data = Buffer.from(json, "utf8").toString("base64");
    return { data };
}
/**
 * Resolve spade/beacon URL from channel page (or settings JS). Caches nothing; caller may cache.
 */
export async function getSpadeUrl(channelLogin, accessToken) {
    const url = `${CHANNEL_PAGE_BASE}/${channelLogin}`;
    const res = await request(url, {
        method: "GET",
        headers: {
            "Client-Id": TWITCH_ANDROID_CLIENT_ID,
            "User-Agent": TWITCH_ANDROID_USER_AGENT,
            Authorization: `OAuth ${accessToken}`
        }
    });
    const html = await res.body.text();
    let match = html.match(SPADE_PATTERN);
    if (match) {
        return match[1];
    }
    match = html.match(SETTINGS_PATTERN);
    if (!match) {
        return `${DEFAULT_SPADE_BASE}/`;
    }
    const settingsUrl = match[1];
    const settingsRes = await request(settingsUrl, {
        method: "GET",
        headers: {
            "Client-Id": TWITCH_ANDROID_CLIENT_ID,
            "User-Agent": TWITCH_ANDROID_USER_AGENT,
            Authorization: `OAuth ${accessToken}`
        }
    });
    const js = await settingsRes.body.text();
    const spadeMatch = js.match(SPADE_PATTERN);
    if (!spadeMatch) {
        return `${DEFAULT_SPADE_BASE}/`;
    }
    return spadeMatch[1];
}
/**
 * POST spade payload to the given URL. Body is application/x-www-form-urlencoded with key "data".
 * Returns true on 204, false otherwise.
 */
export async function sendSpadePost(spadeUrl, payload, accessToken) {
    const body = new URLSearchParams({ data: payload.data }).toString();
    const res = await request(spadeUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Client-Id": TWITCH_ANDROID_CLIENT_ID,
            "User-Agent": TWITCH_ANDROID_USER_AGENT,
            Authorization: `OAuth ${accessToken}`
        },
        body
    });
    return res.statusCode === 204;
}
/**
 * Send a single "minute-watched" beacon for the channel. Resolves spade URL (use cache to avoid repeated fetches)
 * and POSTs. Returns true on success (204).
 */
export async function sendChannelWatch(channel, userId, accessToken, options) {
    const broadcastId = channel.streamId ?? channel.id;
    const payload = buildSpadePayload(broadcastId, channel.id, channel.login, userId);
    const cache = options?.spadeUrlCache;
    let url = cache?.get(channel.login);
    if (!url) {
        try {
            url = await getSpadeUrl(channel.login, accessToken);
            cache?.set(channel.login, url);
        }
        catch {
            url = `${DEFAULT_SPADE_BASE}/`;
        }
    }
    try {
        return await sendSpadePost(url, payload, accessToken);
    }
    catch {
        return false;
    }
}
