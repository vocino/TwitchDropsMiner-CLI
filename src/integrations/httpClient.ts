import { request, Dispatcher } from "undici";

export interface HttpClientOptions {
  retries?: number;
  retryDelayMs?: number;
  headers?: Record<string, string>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function httpJson<T = unknown>(
  method: string,
  url: string,
  body?: unknown,
  options?: HttpClientOptions
): Promise<T> {
  const retries = options?.retries ?? 3;
  const retryDelayMs = options?.retryDelayMs ?? 1_000;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await request(url, {
        method: method as Dispatcher.HttpMethod,
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
        return {} as T;
      }
      return JSON.parse(text) as T;
    } catch (err) {
      lastError = err;
      if (attempt === retries) {
        break;
      }
      await sleep(retryDelayMs * (attempt + 1));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("HTTP request failed.");
}

