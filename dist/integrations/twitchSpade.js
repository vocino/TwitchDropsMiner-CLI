import { request } from "undici";
import { TWITCH_ANDROID_CLIENT_ID, TWITCH_ANDROID_USER_AGENT } from "../core/constants.js";
const SPADE_PATTERN = /"(?:beacon|spade)_?url":\s*"(https:\/\/[.\w\-/]+\.ts(?:\?allow_stream=true)?)"/i;
const SETTINGS_PATTERN = /src="(https:\/\/[\w.]+\/config\/settings\.[0-9a-f]{32}\.js)"/i;
const DEFAULT_SPADE_BASE = "https://spade.twitch.tv";
const CHANNEL_PAGE_BASE = "https://www.twitch.tv";
/** Return ISO-like client_time similar to upstream isonow() */
function isoNow() {
    return new Date().toISOString();
}
function jsonMinify(obj) {
    return JSON.stringify(obj);
}
/**
 * Build minute-watched payload and return { data: base64(json) } as sent by Twitch web.
 * Includes full upstream fields: game, game_id, client_time, is_live, minutes_logged
 */
export function buildSpadePayload(broadcastId, channelId, channelLogin, userId, opts) {
    const payload = [
        {
            event: "minute-watched",
            properties: {
                broadcast_id: broadcastId,
                channel_id: channelId,
                channel: channelLogin,
                client_time: isoNow(),
                game: opts?.gameName ?? "",
                game_id: opts?.gameId ?? "",
                hidden: false,
                is_live: true,
                live: true,
                logged_in: true,
                minutes_logged: 1,
                muted: false,
                user_id: userId
            }
        }
    ];
    const data = Buffer.from(jsonMinify(payload), "utf8").toString("base64");
    return { data };
}
/**
 * Build compressed gzip+base64 GQL payload variant used for more reliable watch beacons
 * (mirrors DevilXD channel.py gql_payload). Returns raw b64 gzip data for SendSpadeEvents mutation.
 */
export function buildSpadeGqlPayload(broadcastId, channelId, channelLogin, userId, opts) {
    const watchPayload = [
        {
            event: "minute-watched",
            properties: {
                broadcast_id: broadcastId,
                channel_id: channelId,
                channel: channelLogin,
                client_time: isoNow(),
                game: opts?.gameName ?? "",
                game_id: opts?.gameId ?? "",
                hidden: false,
                is_live: true,
                live: true,
                logged_in: true,
                minutes_logged: 1,
                muted: false,
                user_id: userId
            }
        }
    ];
    const json = jsonMinify(watchPayload);
    // gzip compress if available (node), fallback to plain b64
    let encodedData;
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const zlib = require("zlib");
        const gz = zlib.gzipSync(Buffer.from(json, "utf8"));
        encodedData = gz.toString("base64");
    }
    catch {
        encodedData = Buffer.from(json, "utf8").toString("base64");
    }
    const query = "\n mutation SendEvents($input: SendSpadeEventsInput!) {\n sendSpadeEvents(input: $input) {\n statusCode\n}\n}\n";
    return { query, encodedData };
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
    const payload = buildSpadePayload(broadcastId, channel.id, channel.login, userId, {
        gameName: channel.gameName,
        gameId: options?.gameId ?? channel.gameId ?? ""
    });
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
/**
 * Fetch real broadcast_id via GetStreamInfo GQL (playback) for higher fidelity spade beacons.
 * Returns stream id string if available, null otherwise.
 */
export async function fetchStreamIdViaGql(channelLogin, token, gqlRequestImpl) {
    try {
        const resp = (await gqlRequestImpl({
            operationName: "VideoPlayerStreamInfoOverlayChannel",
            sha256Hash: "198492e0857f6aedead9665c81c5a06d67b25b58034649687124083ff288597d",
            variables: { channel: channelLogin }
        }, token, { channel: channelLogin }));
        const data = resp?.data;
        const user = data?.user ?? data?.userLogin;
        const stream = user?.stream ?? data?.stream;
        const id = stream?.id;
        return id ? String(id) : null;
    }
    catch {
        return null;
    }
}
