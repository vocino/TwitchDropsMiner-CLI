export function parseTokenInput(input) {
    const trimmed = input.trim();
    if (!trimmed) {
        throw new Error("Empty token input.");
    }
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
        // raw OAuth token
        return { accessToken: trimmed, source: "raw" };
    }
    const key = trimmed.slice(0, eqIndex).trim().toLowerCase();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!value) {
        throw new Error("Token value is empty.");
    }
    if (key === "auth-token") {
        return { accessToken: value, source: "auth-token" };
    }
    // Unknown key, but still treat as token pair
    return { accessToken: value, source: "raw" };
}
