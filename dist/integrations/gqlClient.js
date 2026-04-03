import { httpJson } from "./httpClient.js";
import { TWITCH_GQL_URL, TWITCH_ANDROID_CLIENT_ID, TWITCH_ANDROID_USER_AGENT } from "../core/constants.js";
import { gqlPayload, applyGqlHashOverride } from "./gqlOperations.js";
import { loadConfig } from "../config/store.js";
export class GqlPersistedQueryMismatchError extends Error {
    operationName;
    sha256Hash;
    gqlMessages;
    constructor(operationName, sha256Hash, gqlMessages) {
        super(`Twitch GQL persisted query failed for "${operationName}" (sha256=${sha256Hash}). ` +
            `Set "gqlHashOverrides" in config (see tdm config path) with { "${operationName}": "<new_hash>" }. ` +
            `GQL: ${gqlMessages.slice(0, 400)}`);
        this.name = "GqlPersistedQueryMismatchError";
        this.operationName = operationName;
        this.sha256Hash = sha256Hash;
        this.gqlMessages = gqlMessages;
    }
}
function collectGqlErrorText(payload) {
    const rec = payload;
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
export function assertNoGqlPersistedQueryFailure(operation, payload) {
    const text = collectGqlErrorText(payload);
    if (!text) {
        return;
    }
    if (/PersistedQueryNotFound|NotFoundForSha256|persisted query|does not match|Unknown query/i.test(text)) {
        throw new GqlPersistedQueryMismatchError(operation.operationName, operation.sha256Hash, text);
    }
}
export async function gqlRequest(operation, accessToken, variables) {
    const cfg = loadConfig();
    const resolved = applyGqlHashOverride(operation, cfg.gqlHashOverrides);
    const payload = await httpJson("POST", TWITCH_GQL_URL, gqlPayload(resolved, variables), {
        retries: 3,
        headers: {
            "Client-Id": TWITCH_ANDROID_CLIENT_ID,
            "User-Agent": TWITCH_ANDROID_USER_AGENT,
            Authorization: `OAuth ${accessToken}`
        }
    });
    assertNoGqlPersistedQueryFailure(resolved, payload);
    return payload;
}
