import { httpJson } from "./httpClient.js";
import { TWITCH_GQL_URL, TWITCH_ANDROID_CLIENT_ID, TWITCH_ANDROID_USER_AGENT } from "../core/constants.js";
import { GqlOperation, gqlPayload, applyGqlHashOverride } from "./gqlOperations.js";
import { loadConfig } from "../config/store.js";

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

export async function gqlRequest<T = unknown>(
  operation: GqlOperation,
  accessToken: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const cfg = loadConfig();
  const resolved = applyGqlHashOverride(operation, cfg.gqlHashOverrides);
  const payload = await httpJson<T>("POST", TWITCH_GQL_URL, gqlPayload(resolved, variables), {
    retries: 3,
    headers: {
      "Client-Id": TWITCH_ANDROID_CLIENT_ID,
      "User-Agent": TWITCH_ANDROID_USER_AGENT,
      Authorization: `OAuth ${accessToken}`
    }
  });
  assertNoGqlPersistedQueryFailure(resolved, payload as unknown);
  return payload;
}
