import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  httpJson,
  parseRetryAfterMs,
  parseRetryAfterMsFromValue,
  HttpResponseError
} from "../../integrations/httpClient.js";

test("parseRetryAfterMsFromValue parses delay-seconds", () => {
  assert.equal(parseRetryAfterMsFromValue("5"), 5000);
  assert.equal(parseRetryAfterMsFromValue("0"), 0);
});

test("parseRetryAfterMs reads header object", () => {
  assert.equal(parseRetryAfterMs({ get: () => "2" }), 2000);
  assert.equal(parseRetryAfterMs({ get: () => null }), null);
});

test("httpJson retries on 429 then succeeds", async () => {
  let hits = 0;
  const server = createServer((req, res) => {
    hits += 1;
    if (hits === 1) {
      res.writeHead(429, { "Retry-After": "0" });
      res.end("{}");
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as { port: number };
  try {
    const out = await httpJson<{ ok: boolean }>(
      "GET",
      `http://127.0.0.1:${port}/`,
      undefined,
      { retries: 2, retryDelayMs: 10, timeoutMs: 5000 }
    );
    assert.equal(out.ok, true);
    assert.equal(hits, 2);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test("httpJson fails fast on non-retryable 4xx", async () => {
  const server = createServer((_req, res) => {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "nope" }));
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as { port: number };
  try {
    await assert.rejects(
      () =>
        httpJson("GET", `http://127.0.0.1:${port}/`, undefined, {
          retries: 3,
          timeoutMs: 5000
        }),
      (e: unknown) => e instanceof HttpResponseError && e.statusCode === 404
    );
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});
