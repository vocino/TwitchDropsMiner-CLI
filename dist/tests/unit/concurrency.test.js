import test from "node:test";
import assert from "node:assert/strict";
import { mapWithConcurrency } from "../../core/concurrency.js";
test("mapWithConcurrency limits parallel execution", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = [1, 2, 3, 4, 5, 6];
    const results = await mapWithConcurrency(items, 2, async (n) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight -= 1;
        return n * 2;
    });
    assert.deepEqual(results, [2, 4, 6, 8, 10, 12]);
    assert.equal(maxInFlight, 2);
});
test("mapWithConcurrency preserves order", async () => {
    const out = await mapWithConcurrency(["a", "b", "c"], 3, async (x) => `${x}1`);
    assert.deepEqual(out, ["a1", "b1", "c1"]);
});
