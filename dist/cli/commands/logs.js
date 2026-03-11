import { Command } from "@commander-js/extra-typings";
import { spawn } from "node:child_process";
export const logsCommand = new Command("logs")
    .description("Follow service logs via journalctl")
    .option("--name <name>", "Service unit name", "tdm.service")
    .option("--user", "Use user journal", true)
    .option("--follow", "Follow logs", true)
    .action(async (opts) => {
    const args = [...(opts.user ? ["--user"] : []), "-u", opts.name, ...(opts.follow ? ["-f"] : [])];
    await new Promise((resolve) => {
        const proc = spawn("journalctl", args, { stdio: "inherit" });
        proc.on("close", () => resolve());
    });
});
