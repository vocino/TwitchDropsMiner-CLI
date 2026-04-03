/**
 * Map items to promises with at most `concurrency` in flight (results align with input order).
 */
export async function mapWithConcurrency(items, concurrency, mapper) {
    if (items.length === 0) {
        return [];
    }
    const limit = Math.max(1, Math.min(concurrency, items.length));
    const results = new Array(items.length);
    let next = 0;
    async function worker() {
        while (true) {
            const i = next++;
            if (i >= items.length) {
                return;
            }
            results[i] = await mapper(items[i], i);
        }
    }
    await Promise.all(Array.from({ length: limit }, () => worker()));
    return results;
}
