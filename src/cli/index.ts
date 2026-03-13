#!/usr/bin/env node

import { Command } from "@commander-js/extra-typings";
import { createRequire } from "node:module";
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
const require = createRequire(import.meta.url);
const { version } = require("../../package.json") as { version: string };

program
  .name("tdm")
  .description("Twitch Drops Miner CLI (headless)")
  .version(version);

program.hook("preAction", (_thisCommand, actionCommand) => {
  if (actionCommand.name() === "run" && !actionCommand.getOptionValue("noLock")) {
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

