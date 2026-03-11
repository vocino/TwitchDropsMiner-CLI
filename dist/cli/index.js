#!/usr/bin/env node
import { Command } from "@commander-js/extra-typings";
import { runCommand } from "./commands/run.js";
import { authCommand } from "./commands/auth.js";
import { statusCommand } from "./commands/status.js";
import { configCommand } from "./commands/config.js";
import { gamesCommand } from "./commands/games.js";
import { doctorCommand } from "./commands/doctor.js";
import { healthcheckCommand } from "./commands/healthcheck.js";
import { serviceCommand } from "./commands/service.js";
import { logsCommand } from "./commands/logs.js";
import { ensureSingleInstanceLock } from "../core/runtime.js";
const program = new Command();
program
    .name("tdm")
    .description("Twitch Drops Miner CLI (headless)")
    .version("0.1.0");
program.hook("preAction", (_thisCommand, actionCommand) => {
    if (actionCommand.name() === "run") {
        ensureSingleInstanceLock();
    }
});
program.addCommand(runCommand);
program.addCommand(authCommand);
program.addCommand(statusCommand);
program.addCommand(configCommand);
program.addCommand(gamesCommand);
program.addCommand(doctorCommand);
program.addCommand(healthcheckCommand);
program.addCommand(serviceCommand);
program.addCommand(logsCommand);
program.parseAsync().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Fatal error:", err);
    process.exitCode = 1;
});
