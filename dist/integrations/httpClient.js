import { request } from "undici";
const DEFAULT_TIMEOUT_MS = 30_000;
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function jitterMs(base) {
    return base + Math.floor(Math.random() * 0.25 * base);
}
function backoffMs(attempt, baseDelayMs) {
    const exp = baseDelayMs * 2 ** Math.min(attempt, 8);
    const capped = Math.min(60_000, exp);
    return jitterMs(capped);
}
/** Parse Twitch/HTTP Retry-After header value: seconds or HTTP-date. */
export function parseRetryAfterMsFromValue(raw) {
    if (!raw) {
        return null;
    }
    const trimmed = raw.trim();
    const asNum = Number(trimmed);
    if (!Number.isNaN(asNum) && asNum >= 0) {
        return asNum * 1000;
    }
    const when = Date.parse(trimmed);
    if (!Number.isNaN(when)) {
        return Math.max(0, when - Date.now());
    }
    return null;
}
/** Parse Retry-After from Fetch-style headers. */
export function parseRetryAfterMs(headers) {
    return parseRetryAfterMsFromValue(headers.get("retry-after"));
}
function retryAfterFromUndiciHeaders(headers) {
    const h = headers;
    if (typeof h.get === "function") {
        return parseRetryAfterMsFromValue(h.get("retry-after"));
    }
    return null;
}
function isAbortError(err) {
    return (err instanceof Error &&
        (err.name === "AbortError" || err.message.includes("aborted") || err.message.includes("timeout")));
}
export class HttpResponseError extends Error {
    statusCode;
    bodySnippet;
    constructor(statusCode, bodySnippet) {
        super(`HTTP ${statusCode}: ${bodySnippet.slice(0, 500)}`);
        this.name = "HttpResponseError";
        this.statusCode = statusCode;
        this.bodySnippet = bodySnippet;
    }
}
export async function httpJson(method, url, body, options) {
    const retries = options?.retries ?? 3;
    const retryDelayMs = options?.retryDelayMs ?? 1_000;
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            const signal = AbortSignal.timeout(timeoutMs);
            const response = await request(url, {
                method: method,
                headers: {
                    "content-type": "application/json",
                    ...(options?.headers ?? {})
                },
                body: body !== undefined ? JSON.stringify(body) : undefined,
                signal
            });
            const text = await response.body.text();
            if (response.statusCode >= 200 && response.statusCode < 300) {
                if (!text) {
                    return {};
                }
                return JSON.parse(text);
            }
            if (response.statusCode === 429 || response.statusCode >= 500) {
                lastError = new HttpResponseError(response.statusCode, text);
                if (attempt === retries) {
                    break;
                }
                const fromHeader = retryAfterFromUndiciHeaders(response.headers);
                const waitMs = fromHeader !== null ? fromHeader : backoffMs(attempt, retryDelayMs);
                await sleep(waitMs);
                continue;
            }
            throw new HttpResponseError(response.statusCode, text);
        }
        catch (err) {
            lastError = err;
            if (err instanceof HttpResponseError) {
                throw err;
            }
            if (attempt === retries) {
                break;
            }
            const retryable = isAbortError(err) ||
                err instanceof TypeError ||
                (err instanceof Error &&
                    /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket/i.test(err.message));
            if (!retryable) {
                throw err;
            }
            await sleep(backoffMs(attempt, retryDelayMs));
        }
    }
    throw lastError instanceof Error ? lastError : new Error("HTTP request failed.");
}
