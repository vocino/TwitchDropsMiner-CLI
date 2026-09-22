import { httpJson, sleep } from "./httpClient.js";
import { TWITCH_GQL_URL, getAndroidUserAgent } from "../core/constants.js";
import { getApiClientId } from "../auth/sessionManager.js";
import { GqlOperation, gqlPayload, applyGqlHashOverride } from "./gqlOperations.js";
import { loadConfig } from "../config/store.js";
import { deviceHeaders } from "../state/deviceStore.js";

export class GqlPersistedQueryMismatchError extends Error {
  readonly operationName: string;
  readonly sha256Hash: string;
  readonly gqlMessages: string;

  constructor(operationName: string, sha256Hash: string, gqlMessages: string) {
    super(
      `Twitch GQL persisted query failed for "${operationName}" (sha256=${sha256Hash}). ` +
        `Set "gqlHashOverrides" in config (see tdm config path) with { "${operationName}": "<new_hash>" }. ` +
        `GQL: ${gqlMessages.slice(0, 400)}`
    );
    this.name = "GqlPersistedQueryMismatchError";
    this.operationName = operationName;
    this.sha256Hash = sha256Hash;
    this.gqlMessages = gqlMessages;
  }
}

type GqlErrorEntry = { message?: string; extensions?: Record<string, unknown> };

function collectGqlErrorText(payload: unknown): string {
  const rec = payload as { errors?: GqlErrorEntry[] };
  if (!rec.errors?.length) {
    return "";
  }
  return rec.errors
    .map((e) => {
      const ext = e.extensions ? JSON.stringify(e.extensions) : "";
      return `${e.message ?? ""} ${ext}`;
    })
    .join(" | ");
}

export function assertNoGqlPersistedQueryFailure(operation: GqlOperation, payload: unknown): void {
  const text = collectGqlErrorText(payload);
  if (!text) {
    return;
  }
  if (
    /PersistedQueryNotFound|NotFoundForSha256|persisted query|does not match|Unknown query/i.test(
      text
    )
  ) {
    throw new GqlPersistedQueryMismatchError(operation.operationName, operation.sha256Hash, text);
  }
}

// Transient GQL errors Twitch returns when it aborts/cancels a request under
// load. Retry instead of failing the poll cycle. Mirrors the upstream
// DevilXD twitch.py backoff list (incl. "request cancelled", 825bde3).
const TRANSIENT_GQL_MESSAGES = [
  "service timeout",
  "request cancelled",
  "service unavailable",
  "context deadline exceeded"
];

export function isTransientGqlError(payload: unknown): boolean {
  const rec = payload as { errors?: GqlErrorEntry[] };
  return Boolean(
    rec.errors?.some((e) => TRANSIENT_GQL_MESSAGES.includes((e.message ?? "").toLowerCase()))
  );
}

export async function gqlRequest<T = unknown>(
  operation: GqlOperation,
  accessToken: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const cfg = loadConfig();
  const resolved = applyGqlHashOverride(operation, cfg.gqlHashOverrides);
  const dHeaders = deviceHeaders();
  let lastPayload: T | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const payload = await httpJson<T>("POST", TWITCH_GQL_URL, gqlPayload(resolved, variables), {
      retries: 3,
      proxy: cfg.proxy || undefined,
      headers: {
        "Client-Id": getApiClientId(),
        "User-Agent": getAndroidUserAgent(),
        Authorization: `OAuth ${accessToken}`,
        ...dHeaders
      }
    });
    assertNoGqlPersistedQueryFailure(resolved, payload as unknown);
    if (!isTransientGqlError(payload)) {
      return payload;
    }
    lastPayload = payload;
    await sleep(1000 * (attempt + 1));
  }
  return lastPayload as T;
}
