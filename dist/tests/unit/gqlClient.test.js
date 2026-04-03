import test from "node:test";
import assert from "node:assert/strict";
import { assertNoGqlPersistedQueryFailure, GqlPersistedQueryMismatchError } from "../../integrations/gqlClient.js";
import { GQL_OPERATIONS } from "../../integrations/gqlOperations.js";
test("assertNoGqlPersistedQueryFailure ignores empty errors", () => {
    assertNoGqlPersistedQueryFailure(GQL_OPERATIONS.Inventory, { data: {} });
});
test("assertNoGqlPersistedQueryFailure throws on persisted query mismatch", () => {
    assert.throws(() => assertNoGqlPersistedQueryFailure(GQL_OPERATIONS.Inventory, {
        errors: [{ message: "PersistedQueryNotFound" }]
    }), (e) => e instanceof GqlPersistedQueryMismatchError &&
        e.operationName === "Inventory" &&
        e.sha256Hash === GQL_OPERATIONS.Inventory.sha256Hash);
});
