import { Command } from "@commander-js/extra-typings";
import fs from "node:fs";
import { parseTokenInput } from "../../auth/tokenImport.js";
import { normalizeCookieHeader } from "../../auth/cookieImport.js";
import { loadAuthState, saveAuthState } from "../../state/authStore.js";
import { validateAuthLocally, validateAuthRemote } from "../../auth/validate.js";
import { startDeviceAuth, pollDeviceToken } from "../../auth/deviceAuth.js";
export const authCommand = new Command("auth").description("Authentication commands");
const loginCommand = new Command("login")
    .description("Login using device-code flow (headless-friendly)")
    .option("--no-open", "Do not attempt to open a browser, print URL and code only", true)
    .action(async (opts) => {
    const start = await startDeviceAuth();
    // eslint-disable-next-line no-console
    console.log(`verification_uri=${start.verificationUri}`);
    // eslint-disable-next-line no-console
    console.log(`user_code=${start.userCode}`);
    // eslint-disable-next-line no-console
    console.log(`interval=${start.interval}`);
    // eslint-disable-next-line no-console
    console.log(`expires_in=${start.expiresIn}`);
    if (opts.open) {
        // Intentionally no local browser launch for server safety.
    }
    const accessToken = await pollDeviceToken(start);
    const prev = loadAuthState() || { updatedAt: new Date().toISOString() };
    saveAuthState({
        ...prev,
        accessToken
    });
    // eslint-disable-next-line no-console
    console.log("Device authentication completed and token stored.");
});
const importTokenCommand = new Command("import")
    .description("Import an existing OAuth token")
    .option("--token <token>", "Raw token or auth-token=<value> pair")
    .option("--token-file <path>", "Path to a file containing the token")
    .action(async (opts) => {
    let raw = opts.token;
    if (!raw && opts.tokenFile) {
        raw = fs.readFileSync(opts.tokenFile, "utf8");
    }
    if (!raw) {
        // eslint-disable-next-line no-console
        console.error("No token provided. Use --token or --token-file.");
        process.exitCode = 1;
        return;
    }
    try {
        const imported = parseTokenInput(raw);
        const prev = loadAuthState() || { updatedAt: new Date().toISOString() };
        saveAuthState({
            ...prev,
            accessToken: imported.accessToken
        });
        // eslint-disable-next-line no-console
        console.log("Token imported successfully.");
    }
    catch (err) {
        // eslint-disable-next-line no-console
        console.error(`Failed to import token: ${err.message}`);
        process.exitCode = 1;
    }
});
const importCookieCommand = new Command("import-cookie")
    .description("Import cookies (auth-token and related) from a header string or file")
    .option("--cookie <header>", "Cookie header string")
    .option("--cookie-file <path>", "Path to a Netscape cookie file or header text file")
    .action(async (opts) => {
    let header = opts.cookie;
    if (!header && opts.cookieFile) {
        header = fs.readFileSync(opts.cookieFile, "utf8");
    }
    if (!header) {
        // eslint-disable-next-line no-console
        console.error("No cookies provided. Use --cookie or --cookie-file.");
        process.exitCode = 1;
        return;
    }
    try {
        const imported = normalizeCookieHeader(header);
        const prev = loadAuthState() || { updatedAt: new Date().toISOString() };
        saveAuthState({
            ...prev,
            cookiesHeader: imported.rawHeader
        });
        // eslint-disable-next-line no-console
        console.log("Cookies imported successfully.");
    }
    catch (err) {
        // eslint-disable-next-line no-console
        console.error(`Failed to import cookies: ${err.message}`);
        process.exitCode = 1;
    }
});
const exportCommand = new Command("export")
    .description("Export current auth material in a machine-readable format")
    .option("--format <fmt>", "Output format: env|json", "env")
    .option("--show-secrets", "Include raw secrets in output (use with care)", false)
    .action(async (opts) => {
    const state = loadAuthState();
    if (!state) {
        // eslint-disable-next-line no-console
        console.error("No auth state found.");
        process.exitCode = 1;
        return;
    }
    const tokenValue = opts.showSecrets ? state.accessToken ?? "" : "<redacted>";
    const cookieValue = opts.showSecrets ? state.cookiesHeader ?? "" : "<redacted>";
    if (opts.format === "json") {
        // eslint-disable-next-line no-console
        console.log(JSON.stringify({
            accessToken: tokenValue,
            cookiesHeader: cookieValue,
            updatedAt: state.updatedAt
        }, null, 2));
    }
    else {
        // env format
        // eslint-disable-next-line no-console
        console.log(`TDM_ACCESS_TOKEN=${tokenValue}`);
        // eslint-disable-next-line no-console
        console.log(`TDM_COOKIES_HEADER=${cookieValue}`);
    }
});
const validateCommand = new Command("validate")
    .description("Validate auth material presence and token validity")
    .option("--local-only", "Only check local presence without remote Twitch validation", false)
    .action(async (opts) => {
    const result = validateAuthLocally();
    if (!result.hasToken && !result.hasCookies) {
        // eslint-disable-next-line no-console
        console.error("No auth material found (token or cookies).");
        process.exitCode = 1;
        return;
    }
    // eslint-disable-next-line no-console
    console.log(`Auth state: token=${result.hasToken ? "present" : "missing"}, cookies=${result.hasCookies ? "present" : "missing"}`);
    if (!opts.localOnly) {
        const remote = await validateAuthRemote();
        if (!remote.valid) {
            // eslint-disable-next-line no-console
            console.error(`Remote token validation failed: ${remote.error ?? "unknown error"}`);
            process.exitCode = 1;
            return;
        }
        // eslint-disable-next-line no-console
        console.log(`Remote token validation OK for user ${remote.userId}.`);
    }
});
const logoutCommand = new Command("logout").description("Clear saved auth material").action(() => {
    const state = loadAuthState();
    if (!state) {
        // eslint-disable-next-line no-console
        console.log("No auth state to clear.");
        return;
    }
    // Overwrite with empty values but keep file structure.
    saveAuthState({
        accessToken: undefined,
        cookiesHeader: undefined,
        updatedAt: new Date().toISOString()
    });
    // eslint-disable-next-line no-console
    console.log("Auth state cleared.");
});
authCommand.addCommand(loginCommand);
authCommand.addCommand(importTokenCommand);
authCommand.addCommand(importCookieCommand);
authCommand.addCommand(exportCommand);
authCommand.addCommand(validateCommand);
authCommand.addCommand(logoutCommand);
