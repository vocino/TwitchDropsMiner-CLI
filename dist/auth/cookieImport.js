export function normalizeCookieHeader(input) {
    const header = input.trim();
    if (!header) {
        throw new Error("Empty cookie header.");
    }
    return { rawHeader: header };
}
