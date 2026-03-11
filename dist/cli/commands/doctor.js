import { Command } from "@commander-js/extra-typings";
import os from "node:os";
import { request } from "undici";
import { EXIT_ENV_UNSUPPORTED, EXIT_OK } from "../contracts/exitCodes.js";
export const doctorCommand = new Command("doctor")
    .description("Run environment checks for TwitchDropsMiner CLI")
    .action(async () => {
    // Basic checks for now; can be extended later.
    const issues = [];
    const platform = os.platform();
    if (platform !== "linux" && platform !== "darwin" && platform !== "win32") {
        issues.push(`Unsupported platform: ${platform}`);
    }
    // Node version check is effectively enforced via package.json engines,
    // but we can still surface it here.
    const [majorStr] = process.versions.node.split(".");
    const major = Number(majorStr);
    if (!Number.isNaN(major) && major < 20) {
        issues.push(`Node.js version ${process.versions.node} is below the required >=20.`);
    }
    if (issues.length > 0) {
        for (const msg of issues) {
            // eslint-disable-next-line no-console
            console.error(msg);
        }
        process.exitCode = EXIT_ENV_UNSUPPORTED;
        return;
    }
    try {
        const res = await request("https://id.twitch.tv/oauth2/validate", { method: "GET" });
        if (res.statusCode >= 500) {
            issues.push(`Twitch endpoint returned ${res.statusCode}.`);
        }
    }
    catch (err) {
        issues.push(`Network reachability check failed: ${err.message}`);
    }
    if (issues.length > 0) {
        for (const msg of issues) {
            // eslint-disable-next-line no-console
            console.error(msg);
        }
        process.exitCode = EXIT_ENV_UNSUPPORTED;
        return;
    }
    // eslint-disable-next-line no-console
    console.log("Environment looks OK for TwitchDropsMiner CLI.");
    process.exitCode = EXIT_OK;
});
