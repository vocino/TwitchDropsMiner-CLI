import { request } from "undici";
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export async function httpJson(method, url, body, options) {
    const retries = options?.retries ?? 3;
    const retryDelayMs = options?.retryDelayMs ?? 1_000;
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            const response = await request(url, {
                method: method,
                headers: {
                    "content-type": "application/json",
                    ...(options?.headers ?? {})
                },
                body: body !== undefined ? JSON.stringify(body) : undefined
            });
            const text = await response.body.text();
            if (response.statusCode >= 500) {
                throw new Error(`HTTP ${response.statusCode}: ${text}`);
            }
            if (!text) {
                return {};
            }
            return JSON.parse(text);
        }
        catch (err) {
            lastError = err;
            if (attempt === retries) {
                break;
            }
            await sleep(retryDelayMs * (attempt + 1));
        }
    }
    throw lastError instanceof Error ? lastError : new Error("HTTP request failed.");
}
